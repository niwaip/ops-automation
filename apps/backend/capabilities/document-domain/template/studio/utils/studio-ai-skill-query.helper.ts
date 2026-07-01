import { HttpException, HttpStatus } from '@nestjs/common';

export async function getStudioAiSkillOrThrow(
  getSkillWithDbFallback: (id: string) => Promise<any>,
  id: string
): Promise<any> {
  const skill = await getSkillWithDbFallback(id);
  if (!skill) {
    throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
  }
  return skill;
}
