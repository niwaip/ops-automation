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
import { parseAndVerifySandboxToken } from '../../common/guards/ai-auth.guard';

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
    const userId = userToken ? parseAndVerifySandboxToken(userToken) : null;
    if (!userId) {
      this.logger.warn('Unauthorized sandbox model call attempt');
      throw new HttpException('Invalid or missing sandbox user token', HttpStatus.UNAUTHORIZED);
    }

    this.logger.log(`Proxying model completion for user [${userId}], model: ${body.model || 'default'}`);

    // 2. 解析管理员配置的真实 API 密钥与端点，优先支持内部 ModelService 统一模型底座
    const { apiKey, baseUrl } = await this.resolveUpstreamCredentials();
    const isStream = Boolean(body.stream);

    // 检查是否包含多模态图片或显式请求视觉能力
    const hasImageContent =
      Array.isArray(body.messages) &&
      body.messages.some((msg: any) =>
        Array.isArray(msg?.content) &&
        msg.content.some(
          (b: any) =>
            b?.type === 'image_url' ||
            (typeof b?.image_url === 'object' && Boolean(b.image_url?.url))
        )
      );
    const isVisionRequested =
      body.model === 'vision' ||
      body.model === 'ocr' ||
      hasImageContent;

    let client = null;
    if (isVisionRequested) {
      const visionModel = this.modelService.getPreferredVisionModel();
      if (visionModel) {
        client = this.modelService.getClient(visionModel.id);
      }
    }
    if (!client && body.model) {
      client = this.modelService.getClient(body.model);
      if (!client && !apiKey) {
        this.logger.error(`Explicitly requested model [${body.model}] not found and no upstream API key configured`);
        throw new HttpException(
          `Requested model [${body.model}] is not configured or unavailable on the platform`,
          HttpStatus.BAD_REQUEST
        );
      }
    }
    if (!client && !body.model) {
      const defaultChat = this.modelService.getPreferredDefaultModel({ mode: 'chat' });
      if (defaultChat) {
        client = this.modelService.getClient(defaultChat.id);
      }
      if (!client) {
        client =
          this.modelService.getClient('deepseek-v4-flash-0731') ||
          this.modelService.getClient('deepseek-v4-flash') ||
          this.modelService.getClient('default');
      }
    }

    if (client) {
      this.logger.log(`Using platform-managed model client for sandbox proxy (${body.model || 'default'})`);
      try {
        if (isStream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          let streamSuccess = false;
          const writeChunk = (chunk: string, modelName: string, meta?: any) => {
            const deltaPayload: any = {};
            if (chunk) {
              deltaPayload.content = chunk;
            }
            if (meta?.delta?.tool_calls) {
              deltaPayload.tool_calls = meta.delta.tool_calls;
            }
            const ssePayload = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: modelName,
              choices: [
                {
                  index: 0,
                  delta: deltaPayload,
                  finish_reason: meta?.finish_reason || null,
                },
              ],
            };
            res.write(`data: ${JSON.stringify(ssePayload)}\n\n`);
          };

          try {
            await client.chatCompletionStream(
              {
                messages: body.messages || [{ role: 'user', content: body.prompt || '' }],
                temperature: body.temperature,
                max_tokens: body.max_tokens,
                tools: body.tools,
                tool_choice: body.tool_choice,
              },
              (chunk: string, meta?: any) => writeChunk(chunk, body.model || 'deepseek-chat', meta)
            );
            streamSuccess = true;
          } catch (primaryErr: any) {
            // 当显式指定了具体模型时，严禁静默 fallback 到其他模型，避免模型欺骗
            if (body.model) {
              this.logger.error(
                `Primary model [${body.model}] stream failed (${primaryErr.message}). Explicit model requested; fallback is strictly disabled.`
              );
              throw primaryErr;
            }

            this.logger.warn(
              `Default model stream failed (${primaryErr.message}). Attempting fallback to platform resilient model...`
            );
            const fallbackKeys = isVisionRequested
              ? ['gemini-3.7-flash-high', 'gemini-3.7-flash', 'default']
              : [
                  'deepseek-v4-flash-0731',
                  'deepseek-v4-flash',
                  'gemini-3.7-flash-high',
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
              tools: body.tools,
              tool_choice: body.tool_choice,
            });
            responseContent = response.content;
            responseUsage = response.usage || responseUsage;
          } catch (primaryErr: any) {
            // 当显式指定了具体模型时，严禁静默 fallback 到其他模型，避免模型欺骗
            if (body.model) {
              this.logger.error(
                `Primary model [${body.model}] failed (${primaryErr.message}). Explicit model requested; fallback is strictly disabled.`
              );
              throw primaryErr;
            }

            this.logger.warn(
              `Default model failed (${primaryErr.message}). Attempting fallback to platform resilient model...`
            );
            const fallbackKeys = isVisionRequested
              ? ['gemini-3.7-flash-high', 'gemini-3.7-flash', 'default']
              : [
                  'deepseek-v4-flash-0731',
                  'deepseek-v4-flash',
                  'gemini-3.7-flash-high',
                  'gemini-3.7-flash',
                  'bc660c37-bf55-411b-91cd-8e732b0301f0',
                  'default',
                ];
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
    if (!userToken || !parseAndVerifySandboxToken(userToken)) {
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

  /**
   * 代理图像生成 (Images Generations) 请求
   * 默认优先选用系统配置了【文生图】(image_generation) 角色的模型
   */
  @Post('images/generations')
  @ApiOperation({ summary: 'Image Generations Proxy for Sandboxes' })
  async imageGenerations(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: Record<string, any>,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    // 1. 鉴权：校验虚拟 Token
    const userToken = this.extractBearerToken(authHeader);
    const userId = userToken ? parseAndVerifySandboxToken(userToken) : null;
    if (!userId) {
      this.logger.warn('Unauthorized sandbox image-generation call attempt');
      throw new HttpException('Invalid or missing sandbox user token', HttpStatus.UNAUTHORIZED);
    }

    this.logger.log(`Proxying image generation for user [${userId}]`);

    // 2. 解析系统配置的【文生图】角色模型
    const imageModel =
      this.modelService.selectScopedDefaultModel('image_generation') ||
      this.modelService.getPreferredImageGenerationModel();

    if (!imageModel) {
      this.logger.warn('No active image generation model configured with [image_generation] scope');
      res.status(HttpStatus.NOT_FOUND).json({
        error: {
          message: '当前系统尚未配置活跃的【文生图】模型角色。请在平台「模型配置」中添加生图模型，并将其勾选为【文生图】默认角色。',
          type: 'model_not_configured',
          code: 'IMAGE_GENERATION_MODEL_UNCONFIGURED',
        },
      });
      return;
    }

    // 3. 解析该模型的 API Key 与 Endpoint
    const apiKey = this.modelService.getResolvedApiKeyForModel(imageModel.id);
    const baseUrl = imageModel.api_endpoint;

    if (!apiKey) {
      this.logger.error(`No API key found for configured image generation model [${imageModel.name}]`);
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        error: {
          message: `文生图模型 [${imageModel.name}] 未配置有效 API Key。`,
          type: 'authentication_error',
          code: 'IMAGE_GENERATION_KEY_MISSING',
        },
      });
      return;
    }

    const cleanBase = baseUrl.replace(/\/+$/, '');
    const targetUrl = cleanBase.endsWith('/images/generations')
      ? cleanBase
      : `${cleanBase}/images/generations`;

    try {
      this.logger.log(
        `Forwarding image generation request to: ${targetUrl}, upstream model: ${body.model || imageModel.name}`
      );
      const payload = {
        ...body,
        model: body.model || imageModel.name,
      };

      const upstreamResponse = await axios.post(targetUrl, payload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      });

      res.status(upstreamResponse.status).json(upstreamResponse.data);
    } catch (err: any) {
      const status = err.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const errorData = err.response?.data || { message: err.message };
      this.logger.error(`Upstream image generation call failed (${status}): ${JSON.stringify(errorData)}`);
      res.status(status).json(errorData);
    }
  }

  private extractBearerToken(authHeader?: string): string | null {
    if (!authHeader) return null;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match && match[1] ? match[1].trim() : null;
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
