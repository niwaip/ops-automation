import {
  Controller,
  Post,
  Get,
  Req,
  Res,
  Headers,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import axios from 'axios';
import { ModelService } from './model.service';

const DEFAULT_DEEPSEEK_ENDPOINT = 'https://api.deepseek.com';

@ApiTags('AI-Proxy')
@Controller('ai/proxy/v1')
export class ModelProxyController {
  private readonly logger = new Logger(ModelProxyController.name);

  constructor(private readonly modelService: ModelService) {}

  /**
   * 代理 OpenAI/DeepSeek 兼容的 Chat Completions 请求
   * 拦截来自沙箱的虚拟 Token，替换为管理员集中配置的真实 API 密钥，并将请求透明转发到官方端点
   */
  @Post('chat/completions')
  @ApiOperation({ summary: 'OpenAI/DeepSeek Compatible Chat Completions Proxy for Sandboxes' })
  async chatCompletions(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: Record<string, any>,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    // 1. 鉴权：校验虚拟 Token
    const userToken = this.extractBearerToken(authHeader);
    if (!userToken || !userToken.startsWith('sandbox-user-token-')) {
      this.logger.warn(`Unauthorized sandbox model call attempt with token: ${userToken || 'none'}`);
      throw new HttpException('Invalid or missing sandbox user token', HttpStatus.UNAUTHORIZED);
    }

    const userId = userToken.replace('sandbox-user-token-', '');
    this.logger.log(`Proxying model completion for user [${userId}], model: ${body.model || 'default'}`);

    // 2. 解析管理员配置的真实 API 密钥与端点，优先支持内部 ModelService 统一模型底座
    const { apiKey, baseUrl } = await this.resolveUpstreamCredentials();
    const isStream = Boolean(body.stream);

    // 如果未配置独立原生 DeepSeek API Key，无缝委托给平台已初始化的模型客户端（例如 Bailian/DeepSeek-V4/Flash）
    let client = this.modelService.getClient(body.model);
    if (!client) {
      client =
        this.modelService.getClient('deepseek-v4-flash-0731') ||
        this.modelService.getClient('deepseek-v4-flash') ||
        this.modelService.getClient('default');
    }

    if (!apiKey && client) {
      this.logger.log(`Using platform-managed model client for sandbox proxy (${body.model || 'default'})`);
      try {
        if (isStream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          let streamSuccess = false;
          const writeChunk = (chunk: string, modelName: string) => {
            const ssePayload = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: modelName,
              choices: [
                {
                  index: 0,
                  delta: { content: chunk },
                  finish_reason: null,
                },
              ],
            };
            res.write(`data: ${JSON.stringify(ssePayload)}\n\n`);
          };

          try {
            await client.chatCompletionStream(
              body.messages || [{ role: 'user', content: body.prompt || '' }],
              (chunk: string) => writeChunk(chunk, body.model || 'deepseek-chat')
            );
            streamSuccess = true;
          } catch (primaryErr: any) {
            this.logger.warn(
              `Primary model [${body.model}] stream failed (${primaryErr.message}). Attempting fallback to platform resilient model...`
            );
            const fallbackKeys = [
              'deepseek-v4-flash-0731',
              'deepseek-v4-flash',
              'gemini-3.7-flash',
              'bc660c37-bf55-411b-91cd-8e732b0301f0',
              'default',
            ];
            for (const fbKey of fallbackKeys) {
              const fbClient = this.modelService.getClient(fbKey);
              if (fbClient && fbClient !== client) {
                try {
                  this.logger.log(`Trying fallback model client stream [${fbKey}]...`);
                  await fbClient.chatCompletionStream(
                    body.messages || [{ role: 'user', content: body.prompt || '' }],
                    (chunk: string) => writeChunk(chunk, fbKey)
                  );
                  streamSuccess = true;
                  break;
                } catch (fbErr: any) {
                  this.logger.warn(`Fallback client stream [${fbKey}] also failed: ${fbErr.message}`);
                }
              }
            }
            if (!streamSuccess) {
              throw primaryErr;
            }
          }

          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        } else {
          let responseContent = '';
          let responseUsage: any = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          try {
            const response = await client.chatCompletion({
              messages: body.messages || [{ role: 'user', content: body.prompt || '' }],
              temperature: body.temperature,
              max_tokens: body.max_tokens,
            });
            responseContent = response.content;
            responseUsage = response.usage || responseUsage;
          } catch (primaryErr: any) {
            this.logger.warn(
              `Primary model [${body.model}] failed (${primaryErr.message}). Attempting fallback to platform resilient model...`
            );
            const fallbackKeys = ['deepseek-v4-flash-0731', 'deepseek-v4-flash', 'gemini-3.7-flash', 'bc660c37-bf55-411b-91cd-8e732b0301f0', 'default'];
            let fallbackSucceeded = false;
            for (const fbKey of fallbackKeys) {
              const fbClient = this.modelService.getClient(fbKey);
              if (fbClient && fbClient !== client) {
                try {
                  this.logger.log(`Trying fallback model client [${fbKey}]...`);
                  const fbRes = await fbClient.chatCompletion({
                    messages: body.messages || [{ role: 'user', content: body.prompt || '' }],
                    temperature: body.temperature,
                    max_tokens: body.max_tokens,
                  });
                  responseContent = fbRes.content;
                  responseUsage = fbRes.usage || responseUsage;
                  fallbackSucceeded = true;
                  break;
                } catch (fbErr: any) {
                  this.logger.warn(`Fallback client [${fbKey}] also failed: ${fbErr.message}`);
                }
              }
            }
            if (!fallbackSucceeded) {
              throw primaryErr;
            }
          }

          res.status(HttpStatus.OK).json({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: body.model || 'deepseek-chat',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: responseContent,
                },
                finish_reason: 'stop',
              },
            ],
            usage: responseUsage,
          });
          return;
        }
      } catch (err: any) {
        this.logger.error(`ModelService execution failed: ${err.message}`, err.stack);
        if (res.headersSent) {
          const errPayload = {
            error: {
              message: `Sandbox model execution error: ${err.message}`,
              type: 'server_error',
              code: 500,
            },
          };
          res.write(`data: ${JSON.stringify(errPayload)}\n\n`);
          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        }
        throw new HttpException(`Sandbox model execution error: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }

    if (!apiKey) {
      this.logger.error('No upstream DeepSeek API key or active model client configured by administrator');
      throw new HttpException(
        'Platform administrator has not configured a valid DeepSeek API key or model',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    const targetUrl = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    try {
      if (isStream) {
        // 流式传输响应
        const upstreamResponse = await axios.post(targetUrl, body, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
          timeout: 120000,
        });

        res.status(upstreamResponse.status);
        for (const [key, value] of Object.entries(upstreamResponse.headers)) {
          if (value !== undefined) {
            res.setHeader(key, value as string);
          }
        }

        const dataStream = upstreamResponse.data as any;
        if (dataStream && typeof dataStream.pipe === 'function') {
          dataStream.pipe(res);
        } else {
          res.send(upstreamResponse.data);
        }
      } else {
        // 普通 JSON 响应
        const upstreamResponse = await axios.post(targetUrl, body, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        });

        res.status(upstreamResponse.status).json(upstreamResponse.data);
      }
    } catch (err: any) {
      const status = err.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const errorData = err.response?.data || { message: err.message };
      this.logger.error(`Upstream model proxy call failed (${status}): ${JSON.stringify(errorData)}`);
      res.status(status).json(errorData);
    }
  }

  /**
   * 代理可用的模型列表
   */
  @Get('models')
  @ApiOperation({ summary: 'List models via Proxy' })
  async listModels(@Headers('authorization') authHeader: string | undefined): Promise<Record<string, any>> {
    const userToken = this.extractBearerToken(authHeader);
    if (!userToken || !userToken.startsWith('sandbox-user-token-')) {
      throw new HttpException('Invalid or missing sandbox user token', HttpStatus.UNAUTHORIZED);
    }

    return {
      object: 'list',
      data: [
        { id: 'deepseek-chat', object: 'model', owned_by: 'deepseek' },
        { id: 'deepseek-reasoner', object: 'model', owned_by: 'deepseek' },
      ],
    };
  }

  private extractBearerToken(authHeader?: string): string | null {
    if (!authHeader) return null;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
  }

  private async resolveUpstreamCredentials(): Promise<{ apiKey?: string; baseUrl: string }> {
    // 1. 优先从管理员环境变量获取
    const envKey = process.env.DEEPSEEK_API_KEY;
    const envBase = process.env.DEEPSEEK_BASE_URL;
    let apiKey: string | undefined = envKey ? envKey.trim() : undefined;
    let baseUrl: string = envBase && envBase.trim() ? envBase.trim() : DEFAULT_DEEPSEEK_ENDPOINT;

    // 2. 其次通过 ModelService 注册模型查找
    if (!apiKey) {
      try {
        const models = await this.modelService.listModels();
        const dsModel = models.find((m) => m.provider?.toLowerCase() === 'deepseek');
        if (dsModel) {
          const cred = (this.modelService as any).resolveCredentialForModel?.(dsModel);
          if (cred) {
            apiKey = cred;
          }
          if (dsModel.api_endpoint) {
            baseUrl = dsModel.api_endpoint;
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to query model service for deepseek credential: ${err.message}`);
      }
    }

    return { apiKey, baseUrl };
  }
}
