import * as vscode from 'vscode'
import type { CommitPromptExtensionContext } from '../extension'
import type { CommandCallback } from '.'
import { castIssuesAsQuickPickItem } from '../helpers/issueAsQuickPickItem'

/**
 * Shows a prompt to undo the last commit.
 */
export function close(
  extensionContext: CommitPromptExtensionContext,
  page: number | undefined = 1
): CommandCallback {
  return async () => {
    const { octoKit, user, cwd, repo, outputMessage, cpCodeConfig } = extensionContext

    if (!octoKit || !user?.login || !repo) {
      outputMessage('You do not seem properly logged into GitHub, try setting your `commit-prompt.gitHubToken` first.')
      return
    }

    if (!cwd) { return }

    const issues = await octoKit.request(
      'GET /repos/{owner}/{repo}/issues',
      {
        owner: repo.split('/')[0],
        repo: repo.split('/')[1],
        state: 'open',
        direction: 'desc',
        per_page: cpCodeConfig?.githubPerPage || 25,
        page,
      },
    )

    if (!issues.data.length) {
      outputMessage('There is no opened issues in that repository.')
      return
    }

    const issuesAsQuickPickItem: vscode.QuickPickItem[] = castIssuesAsQuickPickItem(issues.data)

    const picks = await vscode.window.showQuickPick(
      [
        ...(page > 1 ? [{ label: 'Previous page', iconPath: vscode.ThemeIcon.Folder }] : []),
        ...issuesAsQuickPickItem,
        ...(issuesAsQuickPickItem.length === cpCodeConfig.githubPerPage ? [{ label: 'Next page', iconPath: vscode.ThemeIcon.Folder }] : []),
      ],
      {
        title: `Close issues${page > 1 ? ` (Page ${page})` : ''}`,
        canPickMany: true,
        ignoreFocusOut: true,
        placeHolder: 'Close opened issues',
      },
    )

    if (!picks || !picks.length) { return }

    if (picks.find(pick => pick.label === 'Next page')) {
      return await close(extensionContext, page + 1)()
    }

    if (picks.find(pick => pick.label === 'Previous page')) {
      return await close(extensionContext, page - 1 >= 1 ? page - 1 : 1)()
    }

    const successFullyClosed: string[] = []
    const errorWhileClosed: string[] = []

    for (const pick of picks) {
      if (!pick.description) { continue }

      try {
        await octoKit.request(
          'PATCH /repos/{owner}/{repo}/issues/{issue_number}',
          {
            issue_number: Number(pick.description),
            owner: repo.split('/')[0],
            repo: repo.split('/')[1],
            state: 'closed',
          },
        )

        successFullyClosed.push(pick.description)
      }
      catch (e) {
        errorWhileClosed.push(pick.description)
      }
    }

    if (successFullyClosed.length) {
      outputMessage(`Successfully closed issues: ${successFullyClosed.join(', ')}`)
    }

    if (errorWhileClosed.length) {
      outputMessage(`There was an error while closing issues: ${errorWhileClosed.join(', ')}`)
    }
  }
}

export default close
