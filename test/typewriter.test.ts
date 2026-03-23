import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MarkdownTypewriter,
  StreamingMarkdownTypewriter,
} from '../src/index.js';

test('MarkdownTypewriter streams the entire payload in multiple chunks', async () => {
  const chunks: string[] = [];

  await new Promise<void>((resolve) => {
    const typewriter = new MarkdownTypewriter('Hello world. Streaming markdown!', {
      baseDelayMs: 0,
      minChunkSize: 2,
      maxChunkSize: 6,
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
      onComplete: () => {
        resolve();
      },
    });

    typewriter.start();
  });

  assert.equal(chunks.join(''), 'Hello world. Streaming markdown!');
  assert.ok(chunks.length > 1);
});

test('MarkdownTypewriter can pause and resume without losing progress', async () => {
  const chunks: string[] = [];

  await new Promise<void>((resolve) => {
    const typewriter = new MarkdownTypewriter('pause and resume', {
      baseDelayMs: 1,
      minChunkSize: 1,
      maxChunkSize: 3,
      onChunk: (chunk) => {
        chunks.push(chunk);
        if (chunks.length === 1) {
          typewriter.pause();
          setTimeout(() => {
            typewriter.resume();
          }, 2);
        }
      },
      onComplete: () => {
        resolve();
      },
    });

    typewriter.start();
  });

  assert.equal(chunks.join(''), 'pause and resume');
});

test('MarkdownTypewriter emits lifecycle callbacks', async () => {
  const states: string[] = [];

  const typewriter = new MarkdownTypewriter('hello', {
    baseDelayMs: 0,
    minChunkSize: 2,
    maxChunkSize: 2,
    onChunk: () => {},
    onStart: (meta) => {
      states.push(`start:${meta.state}`);
    },
    onPause: (meta) => {
      states.push(`pause:${meta.state}`);
    },
    onResume: (meta) => {
      states.push(`resume:${meta.state}`);
    },
    onStop: (meta) => {
      states.push(`stop:${meta.state}`);
    },
    onComplete: (meta) => {
      states.push(`complete:${meta.state}`);
    },
    onStateChange: (meta) => {
      states.push(`state:${meta.state}`);
    },
  });

  typewriter.start();
  typewriter.pause();
  typewriter.resume();
  typewriter.stop();

  await new Promise<void>((resolve) => {
    const second = new MarkdownTypewriter('done', {
      baseDelayMs: 0,
      minChunkSize: 2,
      maxChunkSize: 2,
      onChunk: () => {},
      onComplete: (meta) => {
        states.push(`done:${meta.state}`);
        resolve();
      },
      onStateChange: (meta) => {
        states.push(`done-state:${meta.state}`);
      },
    });

    second.start();
  });

  assert.ok(states.includes('start:running'));
  assert.ok(states.includes('pause:paused'));
  assert.ok(states.includes('resume:running'));
  assert.ok(states.includes('stop:stopped'));
  assert.ok(states.includes('done:completed'));
});

test('StreamingMarkdownTypewriter consumes pushed chunks and finishes after close', async () => {
  const chunks: string[] = [];
  const doneStates: boolean[] = [];

  await new Promise<void>((resolve) => {
    const typewriter = new StreamingMarkdownTypewriter({
      baseDelayMs: 0,
      minChunkSize: 1,
      maxChunkSize: 4,
      onChunk: (chunk, meta) => {
        chunks.push(chunk);
        doneStates.push(meta.done);
      },
      onComplete: (meta) => {
        assert.equal(meta.closed, true);
        resolve();
      },
    });

    typewriter.push('Hello ');
    typewriter.start();

    setTimeout(() => {
      typewriter.push('world');
      typewriter.close();
    }, 0);
  });

  assert.equal(chunks.join(''), 'Hello world');
  assert.equal(doneStates[0], false);
  assert.equal(doneStates[doneStates.length - 1], true);
});

test('StreamingMarkdownTypewriter exposes code-fence state while waiting for more input', async () => {
  const fenceStates: boolean[] = [];

  await new Promise<void>((resolve) => {
    const typewriter = new StreamingMarkdownTypewriter({
      baseDelayMs: 0,
      minChunkSize: 1,
      maxChunkSize: 3,
      onChunk: (_chunk, meta) => {
        fenceStates.push(meta.inCodeFence);
      },
      onComplete: () => {
        resolve();
      },
    });

    typewriter.push('```ts\nconst a');
    typewriter.start();

    setTimeout(() => {
      typewriter.push(' = 1;\n```\nAfter');
      typewriter.close();
    }, 0);
  });

  assert.ok(fenceStates.includes(true));
  assert.equal(fenceStates[fenceStates.length - 1], false);
});

test('StreamingMarkdownTypewriter waits for close before reporting done', async () => {
  const doneStates: boolean[] = [];

  await new Promise<void>((resolve) => {
    const typewriter = new StreamingMarkdownTypewriter({
      baseDelayMs: 0,
      minChunkSize: 1,
      maxChunkSize: 5,
      onChunk: (_chunk, meta) => {
        doneStates.push(meta.done);
      },
      onComplete: () => {
        resolve();
      },
    });

    typewriter.push('partial');
    typewriter.start();

    setTimeout(() => {
      typewriter.close();
    }, 5);
  });

  assert.equal(doneStates.includes(true), false);
});
