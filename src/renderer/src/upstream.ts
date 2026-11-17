export async function retireBranch(path: string, branch: string, base: string, remote: string): Promise<void> {
  await window.git.checkout(path, base)
  await window.git.fastForward(path, `${remote}/${base}`).catch(() => undefined)
  await window.git.deleteBranch(path, branch, true)
}
