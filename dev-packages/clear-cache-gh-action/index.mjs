import * as core from '@actions/core';

import { context, getOctokit } from '@actions/github';

async function run() {
  const { getInput } = core;

  const { repo, owner } = context.repo;

  const githubToken = getInput('github_token');
  const clearDevelop = getInput('clear_develop', { type: 'boolean' });
  const clearBranches = getInput('clear_branches', { type: 'boolean', default: true });
  const clearPending = getInput('clear_pending', { type: 'boolean' });
  const workflowName = getInput('workflow_name');

  const octokit = getOctokit(githubToken);

  await clearGithubCaches(octokit, {
    repo,
    owner,
    clearDevelop,
    clearPending,
    clearBranches,
    workflowName,
  });
}

/**
 * Clear caches.
 *
 * @param {ReturnType<import("@actions/github").getOctokit> } octokit
 * @param {{repo: string, owner: string, clearDevelop: boolean, clearPending: boolean, clearBranches: boolean, workflowName: string}} options
 */
async function clearGithubCaches(octokit, { repo, owner, clearDevelop, clearPending, clearBranches, workflowName }) {
  for await (const response of octokit.paginate.iterator(octokit.rest.actions.getActionsCacheList, {
    owner,
    repo,
  })) {
    if (!response.data.length) {
      break;
    }

    for (const { id, ref } of response.data) {
      core.info(`Checking cache ${id} for ${ref}...`);
      // Do not clear develop caches if clearDevelop is false.
      if (!clearDevelop && ref === 'refs/head/develop') {
        core.info('> Keeping cache because it is on develop.');
        continue;
      }

      // There are two fundamental paths here:
      // If the cache belongs to a PR, we need to check if the PR has any pending workflows.
      // Else, we assume the cache belongs to a branch, where we do not check for pending workflows
      const pull_number = /^refs\/pull\/(\d+)\/merge$/.exec(ref)?.[1];
      if (pull_number) {
        if (!clearPending) {
          const pr = await octokit.rest.pulls.get({
            owner,
            repo,
            pull_number,
          });

          const prBranch = pr.data.head.ref;

          // Check if PR has any pending workflows
          const workflowRuns = await octokit.rest.actions.listWorkflowRunsForRepo({
            repo,
            owner,
            branch: prBranch,
          });

          // We only care about the relevant workflow
          const relevantWorkflowRuns = workflowRuns.data.workflow_runs.filter(
            workflow => workflow.name === workflowName,
          );

          const latestWorkflowRun = relevantWorkflowRuns[0];

          core.info(`> Latest relevant workflow run: ${latestWorkflowRun.html_url}`);

          // No relevant workflow? Clear caches!
          if (!latestWorkflowRun) {
            core.info('> Clearing cache because no relevant workflow was found.');
            continue;
          }

          // If the latest run was not successful, keep caches
          // as either the run may be in progress,
          // or failed - in which case we may want to re-run the workflow
          if (latestWorkflowRun.conclusion !== 'success') {
            core.info(`> Keeping cache because latest workflow is ${latestWorkflowRun.status}.`);
            continue;
          }

          core.info(`> Clearing cache because latest workflow run is ${latestWorkflowRun.status}.`);
        } else {
          core.info('> Clearing cache of PR workflow run.');
        }
      } else {
        // This means this is not a pull request, so check clearBranches
        if (clearBranches) {
          core.info('> Clearing cache because it is not a PR.');
        } else {
          core.info('> Keeping cache for non-PR workflow run.');
          continue;
        }
      }

      // DRY RUN FOR NOW!
      core.info(`Would delete cache ${id} for ${ref}...`);

      /*   await octokit.rest.actions.deleteActionsCacheById({
        owner,
        repo,
        cache_id: id,
      }); */
    }
  }
}

run();
