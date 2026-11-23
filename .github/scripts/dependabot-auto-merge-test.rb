require 'minitest/autorun'
require_relative 'dependabot-auto-merge'

class DependabotAutoMergeTest < Minitest::Test
  def test_all_dependencies_in_a_group_must_be_minor_or_patch
    assert minor_or_patch?(commit_message('minor', 'patch'), 'dependabot/npm_and_yarn/group')
    refute minor_or_patch?(commit_message('patch', 'major'), 'dependabot/npm_and_yarn/group')
    refute minor_or_patch?(commit_message('patch', nil), 'dependabot/npm_and_yarn/group')
    refute minor_or_patch?(commit_message, 'dependabot/npm_and_yarn/group')
  end

  def test_unclassified_docker_updates_require_a_numeric_bump_within_the_same_variant
    branch = 'dependabot/docker/e2e/playwright-v1.63.0-jammy'
    assert minor_or_patch?(docker_message('v1.61.1-jammy', 'v1.63.0-jammy'), branch)
    assert minor_or_patch?(docker_message('v1.63.0-jammy', 'v1.63.1-jammy'), branch)
    refute minor_or_patch?(docker_message('v1.61.1-jammy', 'v2.0.0-jammy'), branch)
    refute minor_or_patch?(docker_message('v1.61.1-jammy', 'v1.63.0-noble'), branch)
    refute minor_or_patch?(docker_message('v1.63.1-jammy', 'v1.63.0-jammy'), branch)
    refute minor_or_patch?(docker_message('`abcdef`', 'v1.63.0-jammy'), branch)
  end

  def test_only_signed_dependabot_commits_matching_the_tested_head_are_eligible
    patch = dependabot_commit('patch-sha')
    assert eligible_commits?([patch], 'patch-sha', 'dependabot/npm_and_yarn/group')
    refute eligible_commits?([patch], 'older-sha', 'dependabot/npm_and_yarn/group')
    refute eligible_commits?([dependabot_commit('unsigned', verified: false), patch], 'patch-sha',
                             'dependabot/npm_and_yarn/group')
    refute eligible_commits?([dependabot_commit('human', author: 'contributor'), patch], 'patch-sha',
                             'dependabot/npm_and_yarn/group')
  end

  def test_ci_requires_every_test_job_and_uses_the_latest_result
    server = job(1, 'server-test', 'success')
    web = job(2, 'web-test', 'success')
    failure = job(3, 'e2e-test', 'failure')
    success = job(4, 'e2e-test', 'success')

    refute ci_jobs_passed?([server, web])
    refute ci_jobs_passed?([server, web, failure])
    refute ci_jobs_passed?([server, web, job(5, 'e2e-test', 'skipped'), success])
    assert ci_jobs_passed?([success, server, web, failure])
  end

  private

  def commit_message(*types)
    updates = types.each_with_index.map do |type, index|
      { 'dependency-name' => "package-#{index}", 'update-type' => type && "version-update:semver-#{type}" }
    end
    "Update dependencies\n\n#{YAML.dump({ 'updated-dependencies' => updates })}...\n"
  end

  def docker_message(previous, current)
    updates = [{ 'dependency-name' => 'playwright', 'dependency-version' => current }]
    "Bumps playwright from #{previous} to #{current}.\n\n#{YAML.dump({ 'updated-dependencies' => updates })}...\n"
  end

  def dependabot_commit(sha, verified: true, author: 'dependabot[bot]')
    {
      'sha' => sha,
      'author' => { 'login' => author },
      'commit' => { 'verification' => { 'verified' => verified }, 'message' => commit_message('patch') }
    }
  end

  def job(id, name, conclusion)
    { 'id' => id, 'name' => name, 'conclusion' => conclusion }
  end
end
