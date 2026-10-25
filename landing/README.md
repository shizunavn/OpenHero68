# OpenHero68 landing page

Standalone static English/Vietnamese site. It uses the real product screenshots,
logo and bundled Nunito Sans fonts already tracked in this repository. No npm
installation is needed for its build, checks or local preview.

```sh
npm run build:landing
npm run check:landing
npm run preview:landing
```

Preview: http://127.0.0.1:4174/. Language selection is browser-local and optional;
English HTML remains readable without JavaScript. Screenshots can be enlarged
using a native dialog, or followed as ordinary image links without JavaScript.

## Cloudflare Pages

Use a separate Direct Upload Pages project named `openhero68-site`. Keep the
configurator at https://open-hero68.pages.dev/.

```sh
npm run package:landing
npm run check:landing
```

Upload `openhero68-landing-pages.zip` (not the configurator ZIP) in the Pages
dashboard. `index.html` is at the ZIP root. Preview the site before promoting
to production. This static package does not contain a Worker or region endpoint.
The separate Landing page GitHub workflow also produces the ZIP and checksum.

The default canonical URL is https://openhero68-site.pages.dev/. If the project
name changes or a custom domain is added, rebuild with the actual HTTPS origin:

```powershell
$env:LANDING_SITE_URL = 'https://your-landing-domain.example'
npm run package:landing
npm run check:landing
```

For Git-based Pages builds, use build command `npm run build:landing` and output
directory `landing-dist`. Set `LANDING_SITE_URL` in Pages build variables when
changing the public hostname. Direct Upload projects and Git-integrated projects
are separate choices; the current rollout uses Direct Upload.

The landing page never connects to the keyboard or localhost service. Moving
only this page to a different hostname does not require service origin changes.
The download link always points at the latest stable Windows installer on GitHub.
