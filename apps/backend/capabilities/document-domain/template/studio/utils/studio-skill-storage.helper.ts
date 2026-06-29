import * as fs from 'fs';
import * as path from 'path';
import { SkillRepository } from '../../repository/skill.repository';

export type StudioSkillWithDbFallbackReader = (
  id: string
) => Promise<Record<string, unknown> | null>;

export function createStudioSkillWithDbFallbackReader(
  skillRepository: Pick<SkillRepository, 'findById'>,
  templatesDir: string
): StudioSkillWithDbFallbackReader {
  return (id: string) => getStudioSkillWithDbFallback(skillRepository, templatesDir, id);
}

export async function getStudioSkillWithDbFallback(
  skillRepository: Pick<SkillRepository, 'findById'>,
  templatesDir: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const dbSkill = await skillRepository.findById(id);
  if (dbSkill) {
    return dbSkill;
  }

  const fileFallbackCandidates = [
    path.join(templatesDir, `skill_${id}.json`),
    path.join(templatesDir, 'skills', `${id}.json`),
  ];

  for (const skillPath of fileFallbackCandidates) {
    if (fs.existsSync(skillPath)) {
      return JSON.parse(fs.readFileSync(skillPath, 'utf-8')) as Record<string, unknown>;
    }
  }

  return null;
}
