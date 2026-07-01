import { Body, Controller, Get, Param, Put, Query, Request } from '@nestjs/common';
import { RequireAdmin, SkipRbac } from '../decorators';
import type { UpdateUserRolesDto, UserQueryDto } from '../contracts';
import { IdentityAccessUserService } from './identity-access-user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: IdentityAccessUserService) {}

  @RequireAdmin()
  @Get()
  async findAll(@Query() query: UserQueryDto) {
    return this.userService.findAll(query);
  }

  @SkipRbac()
  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: { user: { id: string; role: string } }) {
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return { id: req.user.id };
    }

    return this.userService.findOne(id);
  }

  @RequireAdmin()
  @Put(':id/roles')
  async updateRoles(
    @Param('id') id: string,
    @Body() updateDto: UpdateUserRolesDto,
    @Request() req: { user: { id: string } }
  ) {
    return this.userService.updateRoles(id, updateDto, req.user.id);
  }

  @RequireAdmin()
  @Put(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.userService.deactivate(id);
  }

  @RequireAdmin()
  @Put(':id/activate')
  async activate(@Param('id') id: string) {
    return this.userService.activate(id);
  }
}
