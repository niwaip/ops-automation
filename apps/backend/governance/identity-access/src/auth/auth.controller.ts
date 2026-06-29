import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { Public } from '../decorators';
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
export class AuthController {
  constructor(private readonly authService: IdentityAccessAuthService) {}

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
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
