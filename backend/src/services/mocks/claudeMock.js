function mockClaudeEnforcement(result) {
  return { ...result, verificationScore: Math.min(result.verificationScore + 10, 100) };
}
module.exports = { mockClaudeEnforcement };
