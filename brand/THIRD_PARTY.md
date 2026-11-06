# Third-party components

- xterm.js 6.0.0: https://github.com/xtermjs/xterm.js/tree/6.0.0 (MIT; vendor/xterm-LICENSE).
- @xterm/addon-fit 0.11.0: same upstream project (MIT; vendor/addon-fit-LICENSE).
- NextTrace v1.7.5: https://github.com/nxtrace/NTrace-core/tree/v1.7.5 (GPL-3.0; downloaded as a separate executable when building the PHP image). Corresponding source and license are available at that tag. The executable is not committed to this repository.
- ALS: https://github.com/wikihost-opensource/als (MIT; vendor/als-LICENSE). The official multi-architecture Docker image is pinned by digest and provides speed APIs, traffic events, Ookla Speedtest CLI and on-demand iPerf3. This fork integrates its API; it does not replace the network diagnostic backend.
- LibreSpeed: https://github.com/librespeed/speedtest (LGPL-3.0). The worker is served from the unmodified ALS image, not copied into this repository. See the ALS ui/speedtest submodule for corresponding source. Ookla Speedtest CLI and iPerf3 retain their own upstream licenses.
- Skywolf logo and favicon: https://hk.skywolf.cloud/; Skywolf brand assets are not covered by third-party software licenses.

The Looking Glass upstream license is preserved in ../LICENSE.md.
