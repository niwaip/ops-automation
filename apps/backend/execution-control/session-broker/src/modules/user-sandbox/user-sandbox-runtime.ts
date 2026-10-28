import { BadRequestException, ConflictException } from '@nestjs/common';
import { ContainerHandle, ContainerInspectData, IContainerDriver } from './container-driver.interface';

const RUNTIME_LABEL = 'ops.sandbox.runtime-contract';
const RUNTIME_CONTRACT = 'office-v1';

export async function resolveSandboxImage(driver: IContainerDriver, image: string): Promise<string> {
  let inspect: Awaited<ReturnType<IContainerDriver['inspectImage']>>;
  try {
    inspect = await driver.inspectImage(image);
  } catch {
    throw new BadRequestException('沙箱镜像不可用，请从仓库根目录执行 ./docker/start-smart.sh dev --profile sandbox-build build user-sandbox-image');
  }
  if (inspect.Config?.Labels?.[RUNTIME_LABEL] !== RUNTIME_CONTRACT) {
    throw new BadRequestException('沙箱镜像未通过办公依赖校验，请执行 ./docker/start-smart.sh dev --profile sandbox-build build user-sandbox-image 后重试');
  }
  const expectedRequirements = process.env.USER_SANDBOX_REQUIREMENTS_SHA256;
  if (expectedRequirements && inspect.Config?.Labels?.['ops.sandbox.requirements-sha256'] !== expectedRequirements) {
    throw new BadRequestException('沙箱镜像依赖清单已过期，请执行 ./docker/start-smart.sh dev --profile sandbox-build build user-sandbox-image 后重试');
  }
  return inspect.Id;
}

export async function retireStoppedOutdatedSandbox(
  container: ContainerHandle, inspect: ContainerInspectData, imageId: string,
): Promise<boolean> {
  if (inspect.Image === imageId) return false;
  if (inspect.State?.Running || inspect.State?.Paused) {
    throw new ConflictException('沙箱镜像已更新。请在当前任务完成并停止沙箱后重试，系统将保留工作区并更新运行环境');
  }
  // Never force-stop a running task. Persistent workspace/knowledge bind mounts
  // survive removal of the stopped container's disposable writable layer.
  await container.remove({ force: false });
  return true;
}
