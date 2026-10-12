# Media viewer

Browse folders, open pictures and play videos in a workspace tab beside your chats and browser. Open **Media viewer** from the tab row's **+** menu or the workspace Command Center. Each tab uses its workspace's PandaOS host and starts in the workspace folder. Switch workspaces to view files from another connected host.

Pictures support zoom and reset. Videos use the client's playback, seeking, volume and fullscreen controls. Download saves the current file on your browser or desktop device; mobile opens the system Save or Share dialog. Files travel through your PandaOS connection, including relay connections; no public media server is required. The plugin reads only the folder or file you open.

Use `/media <absolute file path>` in a workspace or agent composer to open a file in the media tab on that composer's host. Your chat stays open. New agents receive instructions to identify the producing host and absolute media path when delivering pictures or videos.

Individual files are limited to 64 MiB. Supported containers include MP4, WebM, MOV and M4V; playback depends on the codecs supported by your client. PNG, JPEG, GIF, WebP, BMP and AVIF pictures use the client's image decoder.

The plugin ships with PandaOS. Both host and client need the release containing the media viewer. No external player or account is required.
