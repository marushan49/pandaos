Lets agents open an existing agent session as a tab in the PandaOS app.

An agent sets the label `pandaos.open-tab-request` on the target agent to the current time in milliseconds, for example with the Paseo `update_agent` tool. Every connected PandaOS app with this plugin then opens that agent's tab. A new value opens the tab again. When the app connects, requests older than two minutes are ignored.

The plugin has no backend code and sends nothing outside the daemon.
