# Cube Coach

A phone web app for the 2x2 through 7x7 cubes. It teaches how to solve each one (the reduction method on the big cubes) and walks you through solving your own scrambled cube one move at a time.

- **Learn**: short lessons on big-cube notation, centers, edge pairing, parity and the 3x3 stage, each with 3D demos.
- **Algorithms**: every algorithm with a case diagram and an animated 3D player.
- **Solve my cube**: tap in your cube's 6 faces, or take a photo of each face with the camera. The app checks them for mistakes and works out a step-by-step solution.
- **Follow along**: see one move at a time on an animated 3D cube, tap "I did it ✓", and the app remembers where you left off.

It works offline. You can add it to your home screen from the browser's share menu.

## Development

No build step and no dependencies. Three.js r160 is vendored in `lib/`.

```
node tests/serve.mjs      # http://localhost:8080
node tests/run.mjs        # all tests (COUNT=500 for the full solver fuzz run, SIZES=4,6 to pick sizes)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.
