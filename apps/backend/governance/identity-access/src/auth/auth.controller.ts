import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Public } from '../decorators';
import { RateLimit, RateLimiterGuard } from '../guards';
import {
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  SsoCallbackDto,
  SsoStartQueryDto,
  SwitchOrgDto,
} from '../contracts';
import { IdentityAccessAuthService } from './identity-access-auth.service';

@Controller('auth')
@UseGuards(RateLimiterGuard)
export class AuthController {
  constructor(private readonly authService: IdentityAccessAuthService) {}

  @Public()
  @RateLimit(15, 60000, 'Too many login attempts. Please wait a minute.')
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @RateLimit(10, 60000, 'Too many registration attempts. Please wait a minute.')
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @RateLimit(30, 60000)
  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @Get('me')
  async me(@Request() req: { user: { id: string } }) {
    return this.authService.me(req.user.id);
  }

  @Post('switch-org')
  async switchOrg(@Body() dto: SwitchOrgDto, @Request() req: { user: { id: string } }) {
    return this.authService.switchActiveOrganization(req.user.id, dto.orgId);
  }

  @Public()
  @Get('sso/providers')
  async listSsoProviders(@Query('orgId') orgId?: string) {
    return this.authService.listSsoProviders(orgId);
  }

  @Public()
  @Get('sso/:provider/start')
  async ssoStart(@Param('provider') provider: string, @Query() query: SsoStartQueryDto) {
    return this.authService.buildSsoStartUrl(provider, query);
  }

  @Public()
  @Post('sso/:provider/callback')
  async ssoCallback(@Param('provider') provider: string, @Body() callback: SsoCallbackDto) {
    return this.authService.handleSsoCallback(provider, callback);
  }
}
