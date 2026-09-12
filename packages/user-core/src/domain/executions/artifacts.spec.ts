import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrowserWorkerArtifactUrl,
  getPhaseArtifactPath,
  extractPhaseStepImageSources,
  extractWorkflowActivitySnapshotSources,
} from '../../../dist/domain/executions/artifacts.js';

describe('getPhaseArtifactPath', () => {
  it('extracts direct snapshotPath or artifactPath or path', () => {
    assert.equal(
      getPhaseArtifactPath({
        id: '1',
        artifactType: 'snapshot',
        payload: { snapshotPath: '/tmp/snap.png' },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      '/tmp/snap.png'
    );
    assert.equal(
      getPhaseArtifactPath({
        id: '2',
        artifactType: 'snapshot',
        payload: { artifactPath: '/tmp/art.png' },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      '/tmp/art.png'
    );
    assert.equal(
      getPhaseArtifactPath({
        id: '3',
        artifactType: 'snapshot',
        payload: { path: '/tmp/direct.png' },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      '/tmp/direct.png'
    );
  });

  it('extracts nested path from output data or snapshot', () => {
    assert.equal(
      getPhaseArtifactPath({
        id: '4',
        artifactType: 'snapshot',
        payload: { output: { data: { screenshotPath: '/tmp/nested-data.png' } } },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      '/tmp/nested-data.png'
    );
    assert.equal(
      getPhaseArtifactPath({
        id: '5',
        artifactType: 'snapshot',
        payload: { output: { snapshot: { path: '/tmp/nested-snap.png' } } },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      '/tmp/nested-snap.png'
    );
  });
});

describe('buildBrowserWorkerArtifactUrl', () => {
  it('handles empty or undefined inputs', () => {
    assert.equal(buildBrowserWorkerArtifactUrl('ws://127.0.0.1:3004', undefined), undefined);
    assert.equal(buildBrowserWorkerArtifactUrl('ws://127.0.0.1:3004', '   '), undefined);
  });

  it('preserves data: URIs as-is', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo';
    assert.equal(buildBrowserWorkerArtifactUrl('ws://127.0.0.1:3004', dataUri), dataUri);
  });

  it('builds worker artifact URL from file path in non-browser environment', () => {
    const path = '/backend-var/tmp/browser-worker/playwright-cli-artifacts/shot.png';
    const url = buildBrowserWorkerArtifactUrl('ws://127.0.0.1:3004', path);
    assert.equal(url, 'http://127.0.0.1:3004/browser/artifacts/shot.png');
  });
});

describe('extractPhaseStepImageSources', () => {
  it('prefers inline base64 image and avoids adding redundant duplicate URL for same step', () => {
    const step = {
      id: 'step-1',
      stepIndex: 0,
      status: 'completed',
      output: {
        screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
        snapshot: { path: '/tmp/shot.png' },
      },
    };
    const sources = extractPhaseStepImageSources('ws://127.0.0.1:3004', step as any, []);
    assert.equal(sources.length, 1);
    assert.ok(sources[0].startsWith('data:image/png;base64'));
  });

  it('falls back to candidate path when inline base64 image is absent', () => {
    const step = {
      id: 'step-2',
      stepIndex: 1,
      status: 'completed',
      output: {
        snapshot: { path: '/tmp/shot-2.png' },
      },
    };
    const sources = extractPhaseStepImageSources('ws://127.0.0.1:3004', step as any, []);
    assert.equal(sources.length, 1);
    assert.equal(sources[0], 'http://127.0.0.1:3004/browser/artifacts/shot-2.png');
  });

  it('falls back to matched snapshotId artifact when output has no image or path', () => {
    const step = {
      id: 'step-3',
      stepIndex: 2,
      status: 'completed',
      snapshotId: 'snap-100',
      output: {},
    };
    const artifacts = [
      {
        id: 'art-1',
        snapshotId: 'snap-100',
        artifactType: 'snapshot',
        payload: { path: '/tmp/shot-matched.png' },
      },
    ];
    const sources = extractPhaseStepImageSources('ws://127.0.0.1:3004', step as any, artifacts as any);
    assert.equal(sources.length, 1);
    assert.equal(sources[0], 'http://127.0.0.1:3004/browser/artifacts/shot-matched.png');
  });
});

describe('extractWorkflowActivitySnapshotSources', () => {
  it('deduplicates snapshots sharing the same snapshotId', () => {
    const phase = {
      id: 'phase-1',
      phaseKey: 'key-1',
      artifacts: [
        {
          id: 'art-1',
          snapshotId: 'snap-common',
          artifactType: 'snapshot',
          payload: { path: '/tmp/shot-common.png' },
        },
        {
          id: 'art-2',
          snapshotId: 'snap-common',
          artifactType: 'snapshot',
          payload: { imageSrc: 'data:image/png;base64,dup' },
        },
      ],
    };
    const sources = extractWorkflowActivitySnapshotSources('ws://127.0.0.1:3004', phase as any);
    assert.equal(sources.length, 1);
  });
});
