const { AdapterContract } = require("../adapterContract");

class SlackAdapter extends AdapterContract {
  constructor() {
    super({
      id: "slack",
      label: "Slack",
      description: "Slack input adapter. First pass stores connection config; OAuth/Events API comes next.",
      configExample: {
        mode: "events-api",
        workspaceName: "my-workspace",
        signingSecret: "***",
        botToken: "xoxb-***",
      },
    });
  }

  async test(config = {}) {
    if (!config.signingSecret && !config.botToken) {
      return {
        ok: false,
        message: "Provide signingSecret and/or botToken. OAuth flow is not implemented yet.",
        configExample: this.configExample,
      };
    }

    return {
      ok: true,
      message: "Slack config shape accepted. Network/OAuth verification is pending.",
      metadata: {
        mode: config.mode || "events-api",
        workspaceName: config.workspaceName || null,
        hasSigningSecret: Boolean(config.signingSecret),
        hasBotToken: Boolean(config.botToken),
      },
    };
  }

  async connect(config = {}) {
    const result = await this.test(config);
    if (!result.ok) return result;
    this.config = { ...config };
    return { ok: true, message: "Slack adapter connected in scaffold mode" };
  }
}

module.exports = { SlackAdapter };
