require 'json'
require 'open3'
require 'yaml'

DEPENDABOT = 'dependabot[bot]'.freeze
ELIGIBLE_UPDATES = %w[version-update:semver-minor version-update:semver-patch].freeze
REQUIRED_JOBS = %w[server-test web-test e2e-test].freeze
DOCKER_TAG = /\Av?(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(-[a-zA-Z0-9][a-zA-Z0-9.-]*)?\z/

def docker_minor_or_patch?(message, update)
  # Docker version bumps can omit update-type. Compare numeric versions within the same tag variant.
  bump = message.match(/^Bumps .+ from (\S+) to (\S+)\.$/)
  return false unless bump && bump[2] == update['dependency-version'].to_s

  previous = DOCKER_TAG.match(bump[1])
  current = DOCKER_TAG.match(bump[2])
  return false unless previous && current && previous[1] == current[1] && previous[4] == current[4]

  (current.captures.first(3).map(&:to_i) <=> previous.captures.first(3).map(&:to_i)) == 1
end

def minor_or_patch?(message, branch)
  metadata = message[/^---\n(updated-dependencies:\n.*?^\.\.\.$)/m, 1]
  return false unless metadata

  updates = YAML.safe_load(metadata)['updated-dependencies']
  return false unless updates.is_a?(Array) && !updates.empty?

  updates.all? do |update|
    next false unless update.is_a?(Hash) && update['dependency-name'].is_a?(String)

    ELIGIBLE_UPDATES.include?(update['update-type']) ||
      (update['update-type'].nil? && updates.one? && branch.start_with?('dependabot/docker/') &&
        docker_minor_or_patch?(message, update))
  end
rescue Psych::Exception
  false
end

def eligible_commits?(commits, head_sha, branch)
  commits.last&.fetch('sha') == head_sha && commits.all? do |entry|
    entry.dig('author', 'login') == DEPENDABOT && entry.dig('commit', 'verification', 'verified') == true &&
      minor_or_patch?(entry.dig('commit', 'message'), branch)
  end
end

def ci_jobs_passed?(jobs)
  # A rerun may only repeat the failed jobs. Use the latest result for each job across attempts.
  latest_jobs = jobs.sort_by { |job| job.fetch('id') }.to_h { |job| [job.fetch('name'), job.fetch('conclusion')] }
  REQUIRED_JOBS.all? { |name| latest_jobs[name] == 'success' }
end

def github_api(endpoint, *args)
  output, status = Open3.capture2('gh', 'api', '--method', 'GET', endpoint, *args)
  abort "GitHub API request failed for #{endpoint}" unless status.success?

  JSON.parse(output)
end

def eligible_pull_request(repo, branch, sha, run_id, run_attempt)
  owner = repo.split('/').first
  pulls = github_api("repos/#{repo}/pulls", '-f', "head=#{owner}:#{branch}", '-f', 'base=main', '-f', 'state=open')
  pr = pulls.find do |pull|
    pull.dig('user', 'login') == DEPENDABOT && pull['draft'] == false &&
      pull.dig('head', 'sha') == sha && pull.dig('head', 'repo', 'full_name') == repo
  end
  return unless pr

  number = pr.fetch('number')
  commits = github_api("repos/#{repo}/pulls/#{number}/commits", '--paginate', '--slurp').flatten(1)
  return unless eligible_commits?(commits, sha, branch)

  runs = github_api("repos/#{repo}/actions/workflows/ci.yml/runs", '-f', 'event=pull_request',
                    '-f', "branch=#{branch}", '-f', "head_sha=#{sha}", '-F', 'per_page=1')
  latest_run = runs.fetch('workflow_runs').first
  return unless latest_run && latest_run['id'] == run_id && latest_run['run_attempt'] == run_attempt &&
    latest_run['conclusion'] == 'success' && latest_run['status'] == 'completed'

  pages = github_api("repos/#{repo}/actions/runs/#{run_id}/jobs", '-f', 'filter=all', '--paginate', '--slurp')
  return number if ci_jobs_passed?(pages.flat_map { |page| page.fetch('jobs') })
end

if $PROGRAM_NAME == __FILE__
  number = eligible_pull_request(ENV.fetch('GITHUB_REPOSITORY'), ENV.fetch('HEAD_BRANCH'), ENV.fetch('HEAD_SHA'),
                                 Integer(ENV.fetch('CI_RUN_ID')), Integer(ENV.fetch('CI_RUN_ATTEMPT')))
  if number
    File.open(ENV.fetch('GITHUB_OUTPUT'), 'a') { |output| output.puts "pr_number=#{number}" }
  else
    puts 'No eligible Dependabot pull request with passing CI for this commit.'
  end
end
