# Third-party material and licenses

[简体中文](../zh-CN/THIRD_PARTY_NOTICES.md)

## Code and guides

Project-owned code and guides use MIT. The installed dependency is Brian Grinstead's [javascript-astar](https://github.com/bgrins/javascript-astar), npm 0.4.1, MIT. Its BinaryHeap implementation credits Marijn Haverbeke; the original declaration is retained in dependency source, with the referenced CC BY 3.0 attribution. Keep the dependency notices and `licenses/javascript-astar-LICENSE`.

## Example character art

Source: [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator), revision `d44ea7d6904891aab8627b80ff4de1560d63bdff`.

Under `examples/whitebridge/modules/pixel-war/public/lpc/`, `manifest.json` lists 109 shipped PNGs, original paths and hashes. `CREDITS.csv` retains used body-part rows and complete relevant weapon/shield families, including authors, URLs and license choices. Some exported variants have different paths from credited base sheets, so the relevant families are retained rather than omitted. `SOURCE-README.md` preserves upstream licensing guidance.

Original assets retain the CC BY-SA, CC BY, OGA-BY or GPL alternatives stated per entry. Follow an applicable choice; the assets are not collectively MIT or CC0. The example's palette/composition visual adaptations are offered under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), with modifications identified. Original license choices and attribution remain; PNGs are unencrypted.

Earlier Live2D/Cubism models and artwork with unclear commercial permissions are not included.

## Music and effects

- [JRPG Epic Rock Battle Theme #1](https://opengameart.org/content/jrpg-epic-rock-battle-theme-1), HydroGene, CC0. Its loop was separated, filtered and remixed into synchronized layers; these are not original studio stems.
- [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE), Sam Gossner and Simon Dalzell; sample editing by Elan Hickler / Soundemote, CC0. Used for effects and short settlement cues.
- [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) and [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio), Kenney, CC0. Re-pitched, combined and mixed.

Processed assets live in the example's `public/audio/score/` with hashes. Rebuild scripts identify source downloads; large intermediate work files are not included. Provider-generated speech and model weights are separate from these CC0 assets and require their own applicable terms.

## Platform names and gift symbols

Bilibili, Xiaohongshu, OBS and other names belong to their respective organizations. This kit has no official endorsement or trademark grant. Sample gift names, IDs and prices demonstrate binding; current room availability is not guaranteed. Official platform gift images are excluded and replaced by project-owned generic box symbols under MIT.

## Optional host and voice

The autonomous Cubism driver is project code under MIT. Install a model and Cubism runtime separately under their respective terms; these binaries are not included in the source release. The fixed adult synthetic reference under assets/host-voice is project-authored CC0 audio, not a recording of a real person. Qwen3-TTS/MLX weights and dependencies are separate downloads with upstream licenses. DJ playlist playback support is included, but third-party commercial recordings are not bundled. The offline example defaults to the licensed score above.
