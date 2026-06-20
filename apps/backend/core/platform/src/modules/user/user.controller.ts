import { Controller, Get, Put, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserRolesDto, UserQueryDto } from '../../dto';
import { RequireAdmin, SkipRbac } from '../../decorators';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @RequireAdmin()
  @Get()
  async findAll(@Query() query: UserQueryDto) {
    return this.userService.findAll(query);
  }

  @SkipRbac()
  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: { user: { id: string; role: string } }) {
    // Users can only view their own profile, admins can view any
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
