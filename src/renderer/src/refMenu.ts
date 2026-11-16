import type { HostInfo, Ref, RepoRefs } from '@shared/types'
import type { Actions } from './actions'
import type { MenuItem } from './components/ContextMenu'
import { shortHash, WIP_HASH } from './util'

export type FocusRef = { kind: 'branch' | 'remote' | 'tag'; name: string }

interface RemoteRef {
  remote: string
  name: string
}

function splitRemote(full: string): RemoteRef {
  const i = full.indexOf('/')
  return { remote: full.slice(0, i), name: full.slice(i + 1) }
}

export function branchUrl(host: HostInfo, branch: string): string {
  if (host.kind === 'github') return `${host.webUrl}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`
  if (host.kind === 'gitlab') return `${host.webUrl}/-/tree/${branch.split('/').map(encodeURIComponent).join('/')}`
  return `${host.webUrl}?version=GB${encodeURIComponent(branch)}`
}

export function commitUrl(host: HostInfo, sha: string): string {
  if (host.kind === 'gitlab') return `${host.webUrl}/-/commit/${sha}`
  return `${host.webUrl}/commit/${sha}`
}

export function pullItems(actions: Actions): MenuItem[] {
  return [
    { icon: 'merge', label: 'Merge', hint: 'git pull --no-rebase', onClick: () => actions.pull('merge') },
    { icon: 'rebase', label: 'Rebase', hint: 'git pull --rebase', onClick: () => actions.pull('rebase') },
    { icon: 'fastForward', label: 'Fast-forward only', hint: 'git pull --ff-only', onClick: () => actions.pull('ff-only') }
  ]
}

export interface RefMenuInput {
  sha: string
  refs: Ref[]
  focus?: FocusRef | null
  repoRefs: RepoRefs
  host: HostInfo | null
  actions: Actions
  filtered: boolean
  history?: { onHeadBranch: boolean; isHead: boolean; merge: boolean; parent?: string; grandparent?: string }
  selected?: string | null
}

export function buildRefMenu({ sha, refs, focus, repoRefs, host, actions, filtered, history, selected }: RefMenuInput): MenuItem[] {
  const current = repoRefs.branches.find((b) => b.current) ?? null
  const cur = current?.name ?? null
  const locals = refs.filter((r) => r.kind === 'branch').map((r) => r.name)
  const remotes = refs.filter((r) => r.kind === 'remote').map((r) => splitRemote(r.name)).filter((r) => r.name !== 'HEAD')
  const tags = refs.filter((r) => r.kind === 'tag').map((r) => r.name)

  let branch: string | null = null
  let remote: RemoteRef | null = null
  if (focus?.kind === 'branch') branch = focus.name
  else if (focus?.kind === 'remote') remote = splitRemote(focus.name)
  else if (!focus || focus.kind !== 'tag') {
    branch = locals.find((b) => b !== cur) ?? locals[0] ?? null
    if (!branch) remote = remotes[0] ?? null
  }

  const info = branch ? repoRefs.branches.find((b) => b.name === branch) ?? null : null
  if (branch && !remote) {
    if (info?.upstream) remote = splitRemote(info.upstream)
    else remote = remotes.find((r) => r.name === branch) ?? null
  }
  const remoteFull = remote ? `${remote.remote}/${remote.name}` : null
  const remoteExists = !!remoteFull && repoRefs.remotes.some((r) => `${r.remote}/${r.name}` === remoteFull)
  const target = branch ?? remoteFull
  const isCurrent = !!branch && branch === cur
  const head = cur ?? 'HEAD'
  const short = shortHash(sha)
  const items: MenuItem[] = []

  const checkoutItems: MenuItem[] = [
    ...locals.filter((b) => b !== cur).map((b) => ({ label: b, onClick: () => actions.checkout(b) })),
    ...remotes.flatMap((r): MenuItem[] => {
      const local = repoRefs.branches.find((b) => b.name === r.name)
      const full = `${r.remote}/${r.name}`
      if (!local) return [{ label: full, hint: `new local ${r.name}`, onClick: () => actions.checkout(r.name) }]
      if (local.current) return []
      if (local.hash === sha) return locals.includes(r.name) ? [] : [{ label: full, hint: `as ${r.name}`, onClick: () => actions.checkout(r.name) }]
      return [{ label: full, hint: `as ${r.name}, fast-forwarded`, onClick: () => actions.checkoutTracking(r.name, full) }]
    })
  ]
  if (checkoutItems.length === 1) items.push({ ...checkoutItems[0], icon: 'checkout', label: `Checkout ${checkoutItems[0].label}` })
  else if (checkoutItems.length > 1) {
    items.push({ icon: 'checkout', label: 'Checkout', items: [...checkoutItems, { label: `${short} (detached HEAD)`, onClick: () => actions.checkout(sha) }] })
  } else if (sha !== repoRefs.headHash) {
    items.push({ icon: 'checkout', label: 'Checkout this commit', hint: 'detached HEAD', onClick: () => actions.checkout(sha) })
  }

  if (target && cur && !isCurrent) {
    items.push(
      { icon: 'merge', label: `Merge ${target} into ${cur}`, onClick: () => actions.merge(target) },
      { icon: 'rebase', label: `Rebase ${cur} onto ${target}`, onClick: () => actions.rebase(target) },
      {
        icon: 'merge',
        label: 'Merge options',
        items: [
          { icon: 'fastForward', label: `Fast-forward ${cur} to ${target}`, onClick: () => actions.fastForward(target) },
          { icon: 'merge', label: `Merge ${target} (no fast-forward)`, hint: 'always make a merge commit', onClick: () => actions.merge(target, 'no-ff') },
          { icon: 'squash', label: `Squash ${target} into ${cur}`, hint: 'stage it as one commit', onClick: () => actions.merge(target, 'squash') }
        ]
      }
    )
  }
  items.push({ separator: true })

  if (branch) {
    items.push(
      isCurrent
        ? { icon: 'pull', label: 'Pull', onClick: () => actions.pull() }
        : { icon: 'pull', label: 'Pull (fast-forward)', disabled: !info?.upstream, onClick: () => actions.updateBranch(branch!) },
      ...(isCurrent ? [{ icon: 'pull' as const, label: 'Pull with', items: pullItems(actions) }] : []),
      { icon: 'push', label: 'Push', onClick: () => (isCurrent ? actions.push() : actions.pushBranch(branch!)) }
    )
  }
  if (host && remoteExists && remote) {
    const noun = host.kind === 'gitlab' ? 'merge request' : 'pull request'
    items.push({ icon: 'pr', label: `Start a ${noun} from ${remoteFull}`, onClick: () => actions.startPullRequest(remote!.name) })
  }
  items.push({ separator: true })

  items.push(
    { icon: 'branch', label: 'Create branch here…', onClick: () => actions.createBranch(sha) },
    { icon: 'cherry', label: 'Cherry-pick commit', onClick: () => actions.cherryPick(sha) },
    { icon: 'undo', label: 'Revert commit', onClick: () => actions.revert(sha) },
    {
      icon: 'reset',
      label: cur ? `Reset ${cur} to this commit` : 'Reset to this commit',
      items: [
        { label: 'Soft', hint: 'keep changes staged', onClick: () => actions.resetTo(sha, 'soft') },
        { label: 'Mixed', hint: 'keep changes unstaged', onClick: () => actions.resetTo(sha, 'mixed') },
        { label: 'Hard', hint: 'discard changes', danger: true, onClick: () => actions.resetTo(sha, 'hard') }
      ]
    }
  )
  if (history?.onHeadBranch && !history.merge) {
    const { parent, grandparent, isHead } = history
    items.push({
      icon: 'edit',
      label: 'Edit history',
      items: [
        { icon: 'edit', label: 'Reword commit message…', disabled: !parent, onClick: () => actions.interactiveRebase(parent!, { [sha]: 'reword' }) },
        { icon: 'squash', label: 'Squash into parent commit', disabled: !grandparent, onClick: () => actions.interactiveRebase(grandparent!, { [sha]: 'squash' }) },
        { icon: 'trash', label: 'Drop commit…', danger: true, disabled: !parent, onClick: () => actions.interactiveRebase(parent!, { [sha]: 'drop' }) },
        { separator: true },
        { icon: 'rebase', label: 'Interactive rebase from here…', disabled: isHead, onClick: () => actions.interactiveRebase(sha) }
      ]
    })
  }
  items.push({ separator: true })

  const compareItems: MenuItem[] = [
    ...(target && !isCurrent
      ? [{ label: `${target} with ${head}`, hint: 'since they diverged', onClick: () => actions.compare({ from: 'HEAD', to: target, fromLabel: head, toLabel: target, mode: 'merge-base' }) }]
      : []),
    {
      label: `${short} with ${head}`,
      disabled: sha === repoRefs.headHash,
      onClick: () => actions.compare({ from: sha, to: 'HEAD', fromLabel: short, toLabel: head, mode: 'direct' })
    },
    { label: `${short} with the working tree`, onClick: () => actions.compare({ from: sha, to: null, fromLabel: short, toLabel: 'Working tree', mode: 'direct' }) },
    ...(selected && selected !== sha && selected !== WIP_HASH
      ? [{ label: `${short} with the selected commit`, hint: shortHash(selected), onClick: () => actions.compare({ from: sha, to: selected, fromLabel: short, toLabel: shortHash(selected), mode: 'direct' }) }]
      : [])
  ]
  const createItems: MenuItem[] = [
    { icon: 'tag', label: 'Tag here…', onClick: () => actions.createTag(sha, false) },
    { icon: 'tag', label: 'Annotated tag here…', onClick: () => actions.createTag(sha, true) },
    { separator: true },
    ...locals.filter((b) => b !== cur).map((b): MenuItem => ({ icon: 'folder', label: `Worktree from ${b}`, onClick: () => actions.addWorktree(b, null) })),
    ...remotes
      .filter((r) => !repoRefs.branches.some((b) => b.name === r.name))
      .map((r): MenuItem => ({ icon: 'folder', label: `Worktree from ${r.remote}/${r.name}`, hint: `new local ${r.name}`, onClick: () => actions.addWorktree(`${r.remote}/${r.name}`, r.name) })),
    { icon: 'folder', label: `Worktree at ${short}`, hint: 'detached HEAD', onClick: () => actions.addWorktree(sha, null) },
    { separator: true },
    { icon: 'file', label: 'Patch from commit…', onClick: () => actions.savePatch(sha) }
  ]
  const hostName = host?.kind === 'azure' ? 'Azure DevOps' : host?.kind === 'github' ? 'GitHub' : 'GitLab'
  const copyItems: MenuItem[] = [
    ...(target ? [{ label: 'Branch name', onClick: () => actions.copyText(branch ?? remote!.name, 'branch name') }] : []),
    { label: 'Commit SHA', onClick: () => actions.copyHash(sha) },
    ...(host && remote && remoteExists ? [{ label: `Link to ${remoteFull}`, onClick: () => actions.copyText(branchUrl(host, remote!.name), 'branch link') }] : []),
    ...(host ? [{ label: `Link to this commit on ${hostName}`, onClick: () => actions.copyText(commitUrl(host, sha), 'commit link') }] : [])
  ]
  const filterItems: MenuItem[] = [
    ...(branch && remoteExists && remote
      ? [{ label: `Show only ${branch} and ${remoteFull}`, onClick: () => actions.soloRefs([`refs/heads/${branch}`, `refs/remotes/${remoteFull}`]) }]
      : []),
    ...locals.map((b) => ({ label: `Show only ${b}`, onClick: () => actions.soloRefs([`refs/heads/${b}`]) })),
    ...remotes.map((r) => ({ label: `Show only ${r.remote}/${r.name}`, onClick: () => actions.soloRefs([`refs/remotes/${r.remote}/${r.name}`]) })),
    { separator: true },
    ...locals.filter((b) => b !== cur).map((b) => ({ label: `Hide ${b}`, onClick: () => actions.hideRef(`refs/heads/${b}`) })),
    ...remotes.map((r) => ({ label: `Hide ${r.remote}/${r.name}`, onClick: () => actions.hideRef(`refs/remotes/${r.remote}/${r.name}`) })),
    ...tags.map((t) => ({ label: `Hide ${t}`, hint: 'tag', onClick: () => actions.hideRef(`refs/tags/${t}`) })),
    ...(filtered ? [{ separator: true }, { label: 'Show all branches', onClick: () => actions.showAllRefs() }] : [])
  ]
  items.push(
    { icon: 'compare', label: 'Compare', items: compareItems },
    { icon: 'plus', label: 'Create', items: createItems },
    { icon: 'copy', label: 'Copy', items: copyItems },
    { icon: 'eye', label: 'Filter graph', items: filterItems },
    { separator: true }
  )

  const branchItems: MenuItem[] = [
    ...(branch
      ? [
          { icon: 'edit' as const, label: 'Rename…', onClick: () => actions.renameBranch(branch!) },
          { icon: 'link' as const, label: 'Set upstream…', onClick: () => actions.setUpstream(branch!) },
          { icon: 'push' as const, label: 'Force push (with lease)…', danger: true, disabled: !info?.upstream, onClick: () => actions.forcePush(branch!) },
          { separator: true },
          { icon: 'trash' as const, label: `Delete ${branch}`, danger: true, disabled: isCurrent, onClick: () => actions.deleteBranch(branch!) }
        ]
      : []),
    ...(remote && remoteExists ? [{ icon: 'trash' as const, label: `Delete ${remoteFull}`, danger: true, onClick: () => actions.deleteRemoteBranch(remote!.remote, remote!.name) }] : []),
    ...(branch && remote && remoteExists
      ? [{ icon: 'trash' as const, label: `Delete ${branch} and ${remoteFull}`, danger: true, disabled: isCurrent, onClick: () => actions.deleteBranchEverywhere(branch!, remote!.remote, remote!.name) }]
      : [])
  ]
  if (branchItems.length) items.push({ icon: 'branch', label: `Branch ${branch ?? remoteFull}`, items: branchItems })

  const tagRemote = remote?.remote ?? repoRefs.remotes[0]?.remote ?? 'origin'
  const tagFocus = focus?.kind === 'tag' ? [focus.name] : tags
  for (const t of tagFocus) {
    items.push({
      icon: 'tag',
      label: `Tag ${t}`,
      items: [
        { icon: 'push', label: `Push to ${tagRemote}`, onClick: () => actions.pushTag(tagRemote, t) },
        { icon: 'copy', label: 'Copy tag name', onClick: () => actions.copyText(t, 'tag name') },
        { separator: true },
        { icon: 'trash', label: 'Delete locally', danger: true, onClick: () => actions.deleteTag(t) },
        { icon: 'trash', label: `Delete from ${tagRemote}`, danger: true, onClick: () => actions.deleteRemoteTag(tagRemote, t) }
      ]
    })
  }
  return items
}
