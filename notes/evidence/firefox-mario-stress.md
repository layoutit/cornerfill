# Firefox Mario stress evidence

Captured 2026-08-04 with Firefox 152.0.4 in eight fresh, headless sessions:

```sh
node scripts/trace-firefox-mario.mjs --mode=both --frames=820 --warmup=60 --trials=1 --pairs=2 --headless
```

The source-backed fixture retained 1,213 face elements, all using `-moz-element()`. Four OFF lanes and four ON lanes completed the same 820 source ticks with one identical workload signature (`912485f6`), identical start/end source state, and identical leaf hashes.

| Measure | OFF | ON | ON / OFF |
| --- | ---: | ---: | ---: |
| source-tick FPS | 24.545 | 24.685 | 1.006 |
| display p95 | 50.000 ms | 50.000 ms | 1.000 |
| display p99 | 66.660 ms | 66.680 ms | 1.000 |
| display frames over 33 ms | 2,600 | 2,431 | 0.935 |

Each ON lane performed exactly 132,424 changed-face paints for the 132,424 atlas-position changes; transform-only animation did not paint. The measured animation interval performed zero style checks, geometry builds, surface resizes, or image decodes. Initial attachment of all 1,213 faces took 270–279 ms across the four ON sessions. Every teardown ended with zero entries, surfaces, Firefox registrations, image-cache references, owned elements, live-image properties, and errors.

The 95% confidence intervals for source-tick FPS overlap: OFF 24.421–24.670 and ON 24.445–24.930. ON had a lower mean display-frame time and fewer frames over 33 ms, but this headless trace supports the bounded hot-path and workload claims above, not a performance-improvement claim.

Evidence identities:

- Cornerfill runtime SHA-256: `13a476b785219b2e3ce551b9694930bbb24e7852a3704c4d078c1865a931377d`
- Cornerfill painter SHA-256: `374800d429ff1a5cb59510547e67efcdbfbff1c20ae7e5aa92c6db423dd925bb`
- Cornerfill backends SHA-256: `d381a3c06256a7efae5a52d7b414515b3477ddec0530e172ff036bef062b5eff`
- Mario `texels.webp` SHA-256: `cb3cbaedb6a0a6680652640210df470f48b4d92f1896a35e816851379b91f5ca`

This trace qualifies workload identity and runtime behavior, not visual parity. Firefox WebDriver screenshots do not faithfully capture this `-moz-element()` scene, so visual acceptance remains a headed OS-compositor gate. Native-versus-candidate oracle comparisons remain `UNQUALIFIED`; no tolerance was changed for this evidence.
