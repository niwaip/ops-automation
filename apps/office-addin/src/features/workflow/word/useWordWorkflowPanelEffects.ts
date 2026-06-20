import { useEffect, useRef } from 'react';
import type { TemplateCompareResponse, TemplateUnderstandResponse } from '../../../api/carbone-api';
import type { AISuggestion } from '../../../app/store';
import {
  detectWordWorkflowUnderstandingCache,
  probeWordCompareCache,
} from './word-workflow.actions.helpers';
import {
  buildWordCompareCacheKey,
  loadWordCompareCache,
  removeWordCompareCacheEntry,
  type WordSectionGenerationResult,
} from './word-workflow.cache';
import type {
  CompareHeadingLanguageSelection,
  SampleUploadState,
} from './word-workflow.panel.helpers';

type CompareSectionLike = {
  sectionKey: string;
};

type HostAdapterLike = {
  extractDocument: () => Promise<unknown>;
};

const UPLOAD_RENDER_LOOP_DEBUG_URL = 'http://127.0.0.1:7777/event';

const reportUploadRenderLoop = (
  hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E',
  location: string,
  msg: string,
  data: Record<string, unknown>
) => {
  void fetch(UPLOAD_RENDER_LOOP_DEBUG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'upload-render-loop',
      runId: 'pre-fix',
      hypothesisId,
      location,
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};

function areStringListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function areBooleanMapsEqual(
  left: Record<string, boolean>,
  right: Record<string, boolean>
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
}

interface UseWordWorkflowPanelEffectsOptions {
  hostAdapter: HostAdapterLike;
  sampleUploadState: SampleUploadState;
  selectedTemplateType: string;
  effectiveCompareHeadingLanguages: CompareHeadingLanguageSelection[];
  workflowSourceLanguage: string;
  workflowTargetLanguages: string[];
  languageSignature: string;
  currentRecognitionCacheSignature: string;
  compareCandidateSections: CompareSectionLike[];
  sectionGenerationResults: WordSectionGenerationResult[];
  setWorkflowSourceLanguage: (language: string) => void;
  setWorkflowTargetLanguages: (languages: string[]) => void;
  setCollapsedCompareSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setSelectedCompareSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCollapsedRecognitionSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCompareDocumentIr: (documentIr: Record<string, any> | null) => void;
  setCompareResult: (result: TemplateCompareResponse | null) => void;
  setCompareCacheStatus: (status: 'hit' | 'miss' | null) => void;
  setCompareCacheUpdatedAt: (updatedAt: number | null) => void;
  setSectionGenerationResults: (results: WordSectionGenerationResult[]) => void;
  setSuggestions: (suggestions: AISuggestion[]) => void;
  setRecognitionResult: (result: null) => void;
  setRecognitionRevision: (revision: number) => void;
  setRecognitionLanguageSignature: (signature: string) => void;
  setRecognitionCompareSignature: (signature: string) => void;
  setRecognitionActivated: (activated: boolean) => void;
  setDetectedUploadCacheStatus: (status: 'available' | 'none' | 'checking' | null) => void;
  setDetectedUploadCacheUpdatedAt: (updatedAt: number | null) => void;
  setDetectedUploadCacheResult: (result: TemplateUnderstandResponse | null) => void;
}

export function useWordWorkflowPanelEffects(options: UseWordWorkflowPanelEffectsOptions) {
  const compareCacheProbeTokenRef = useRef(0);
  const cacheProbeTokenRef = useRef(0);

  useEffect(() => {
    reportUploadRenderLoop(
      'A',
      'WordTemplateWorkflowPanel:compare-sections-effect',
      'compare section effect fired',
      {
        sectionCount: options.compareCandidateSections.length,
        sectionKeys: options.compareCandidateSections.map((section) => section.sectionKey),
      }
    );

    if (options.compareCandidateSections.length === 0) {
      options.setCollapsedCompareSections((current) =>
        Object.keys(current).length === 0 ? current : {}
      );
      options.setSelectedCompareSections((current) =>
        Object.keys(current).length === 0 ? current : {}
      );
      return;
    }

    options.setCollapsedCompareSections((current) => {
      const nextState: Record<string, boolean> = {};
      options.compareCandidateSections.forEach((section) => {
        nextState[section.sectionKey] = current[section.sectionKey] ?? true;
      });
      return areBooleanMapsEqual(current, nextState) ? current : nextState;
    });
    options.setSelectedCompareSections((current) => {
      const nextState: Record<string, boolean> = {};
      options.compareCandidateSections.forEach((section) => {
        nextState[section.sectionKey] = current[section.sectionKey] ?? true;
      });
      return areBooleanMapsEqual(current, nextState) ? current : nextState;
    });
  }, [
    options.compareCandidateSections,
    options.setCollapsedCompareSections,
    options.setSelectedCompareSections,
  ]);

  useEffect(() => {
    reportUploadRenderLoop(
      'B',
      'WordTemplateWorkflowPanel:recognition-sections-effect',
      'recognition section effect fired',
      {
        sectionCount: options.sectionGenerationResults.length,
        sectionKeys: options.sectionGenerationResults.map((section) => section.sectionKey),
      }
    );

    if (options.sectionGenerationResults.length === 0) {
      options.setCollapsedRecognitionSections((current) =>
        Object.keys(current).length === 0 ? current : {}
      );
      return;
    }

    options.setCollapsedRecognitionSections((current) => {
      const nextState: Record<string, boolean> = {};
      options.sectionGenerationResults.forEach((section) => {
        nextState[section.sectionKey] = current[section.sectionKey] ?? false;
      });
      return areBooleanMapsEqual(current, nextState) ? current : nextState;
    });
  }, [options.sectionGenerationResults, options.setCollapsedRecognitionSections]);

  useEffect(() => {
    const nextTargetLanguages = options.effectiveCompareHeadingLanguages.filter(
      (language) => language !== 'zh'
    );

    reportUploadRenderLoop(
      'C',
      'WordTemplateWorkflowPanel:language-sync-effect',
      'language sync effect fired',
      {
        effectiveCompareHeadingLanguages: options.effectiveCompareHeadingLanguages,
        workflowSourceLanguage: options.workflowSourceLanguage,
        workflowTargetLanguages: options.workflowTargetLanguages,
        nextTargetLanguages,
      }
    );

    if (options.workflowSourceLanguage !== 'zh') {
      options.setWorkflowSourceLanguage('zh');
    }
    if (!areStringListsEqual(options.workflowTargetLanguages, nextTargetLanguages)) {
      options.setWorkflowTargetLanguages(nextTargetLanguages);
    }
  }, [
    options.effectiveCompareHeadingLanguages,
    options.setWorkflowSourceLanguage,
    options.setWorkflowTargetLanguages,
    options.workflowSourceLanguage,
    options.workflowTargetLanguages,
  ]);

  useEffect(() => {
    reportUploadRenderLoop(
      'D',
      'WordTemplateWorkflowPanel:compare-cache-effect',
      'compare cache probe effect fired',
      {
        uploaded: options.sampleUploadState.uploaded,
        hasFileBase64: Boolean(options.sampleUploadState.fileBase64),
        revision: options.sampleUploadState.revision,
        selectedTemplateType: options.selectedTemplateType,
        effectiveCompareHeadingLanguages: options.effectiveCompareHeadingLanguages,
      }
    );

    if (!options.sampleUploadState.uploaded || !options.sampleUploadState.fileBase64) {
      options.setCompareDocumentIr(null);
      options.setCompareResult(null);
      options.setCompareCacheStatus(null);
      options.setCompareCacheUpdatedAt(null);
      return;
    }

    const currentProbeToken = compareCacheProbeTokenRef.current + 1;
    compareCacheProbeTokenRef.current = currentProbeToken;

    void options.hostAdapter
      .extractDocument()
      .then(() =>
        probeWordCompareCache({
          hostAdapter: options.hostAdapter,
          sampleUploadState: options.sampleUploadState,
          selectedTemplateType: options.selectedTemplateType,
          effectiveCompareHeadingLanguages: options.effectiveCompareHeadingLanguages,
          buildWordCompareCacheKey,
          loadWordCompareCache,
        })
      )
      .then(({ documentIr, compareCacheKey, hasStoredCompareEntry, cachedCompareEntry }) => {
        if (compareCacheProbeTokenRef.current !== currentProbeToken) {
          return;
        }

        reportUploadRenderLoop(
          'D',
          'WordTemplateWorkflowPanel:compare-cache-effect-result',
          'compare cache probe resolved',
          {
            hasStoredCompareEntry,
            hasCachedCompareEntry: Boolean(cachedCompareEntry),
            paragraphCount: documentIr?.paragraphs?.length || 0,
          }
        );

        options.setCompareDocumentIr(documentIr);
        if (cachedCompareEntry) {
          const cachedResult: TemplateCompareResponse = {
            ...cachedCompareEntry.result,
            cacheStatus: {
              compareHit: true,
            },
          };
          options.setCompareResult(cachedResult);
          if (cachedCompareEntry.result.recognitionSnapshot) {
            options.setSectionGenerationResults(
              cachedCompareEntry.result.recognitionSnapshot.sectionGenerationResults
            );
            options.setSuggestions(cachedCompareEntry.result.recognitionSnapshot.suggestions);
            options.setCollapsedRecognitionSections(
              cachedCompareEntry.result.recognitionSnapshot.collapsedSections || {}
            );
            options.setRecognitionResult(null);
            options.setRecognitionRevision(options.sampleUploadState.revision);
            options.setRecognitionLanguageSignature(options.languageSignature);
            options.setRecognitionCompareSignature(options.currentRecognitionCacheSignature);
            options.setRecognitionActivated(true);
          }
          options.setCompareCacheStatus('hit');
          options.setCompareCacheUpdatedAt(cachedCompareEntry.updatedAt);
          return;
        }

        if (hasStoredCompareEntry) {
          removeWordCompareCacheEntry(compareCacheKey);
        }
        options.setCompareCacheStatus(null);
        options.setCompareCacheUpdatedAt(null);
      })
      .catch(() => {
        if (compareCacheProbeTokenRef.current !== currentProbeToken) {
          return;
        }

        reportUploadRenderLoop(
          'D',
          'WordTemplateWorkflowPanel:compare-cache-effect-error',
          'compare cache probe failed',
          {
            revision: options.sampleUploadState.revision,
          }
        );
        options.setCompareCacheStatus(null);
        options.setCompareCacheUpdatedAt(null);
      });
  }, [
    options.currentRecognitionCacheSignature,
    options.effectiveCompareHeadingLanguages,
    options.hostAdapter,
    options.languageSignature,
    options.sampleUploadState,
    options.selectedTemplateType,
    options.setCollapsedRecognitionSections,
    options.setCompareCacheStatus,
    options.setCompareCacheUpdatedAt,
    options.setCompareDocumentIr,
    options.setCompareResult,
    options.setRecognitionActivated,
    options.setRecognitionCompareSignature,
    options.setRecognitionLanguageSignature,
    options.setRecognitionResult,
    options.setRecognitionRevision,
    options.setSectionGenerationResults,
    options.setSuggestions,
  ]);

  useEffect(() => {
    reportUploadRenderLoop(
      'E',
      'WordTemplateWorkflowPanel:upload-cache-effect',
      'upload cache detect effect fired',
      {
        uploaded: options.sampleUploadState.uploaded,
        hasFileBase64: Boolean(options.sampleUploadState.fileBase64),
        revision: options.sampleUploadState.revision,
        workflowSourceLanguage: options.workflowSourceLanguage,
        workflowTargetLanguages: options.workflowTargetLanguages,
      }
    );

    if (!options.sampleUploadState.uploaded || !options.sampleUploadState.fileBase64) {
      options.setDetectedUploadCacheStatus(null);
      options.setDetectedUploadCacheUpdatedAt(null);
      options.setDetectedUploadCacheResult(null);
      return;
    }

    const currentProbeToken = cacheProbeTokenRef.current + 1;
    cacheProbeTokenRef.current = currentProbeToken;
    options.setDetectedUploadCacheStatus('checking');

    void detectWordWorkflowUnderstandingCache({
      hostAdapter: options.hostAdapter,
      sampleUploadState: options.sampleUploadState,
      workflowSourceLanguage: options.workflowSourceLanguage,
      workflowTargetLanguages: options.workflowTargetLanguages,
    })
      .then((matchedEntry) => {
        if (cacheProbeTokenRef.current !== currentProbeToken) {
          return;
        }

        reportUploadRenderLoop(
          'E',
          'WordTemplateWorkflowPanel:upload-cache-effect-result',
          'upload cache detect resolved',
          {
            hasMatchedEntry: Boolean(matchedEntry),
            updatedAt: matchedEntry?.updatedAt || null,
          }
        );

        if (matchedEntry) {
          options.setDetectedUploadCacheStatus('available');
          options.setDetectedUploadCacheUpdatedAt(matchedEntry.updatedAt);
          options.setDetectedUploadCacheResult(matchedEntry.result);
          return;
        }
        options.setDetectedUploadCacheStatus('none');
        options.setDetectedUploadCacheUpdatedAt(null);
        options.setDetectedUploadCacheResult(null);
      })
      .catch(() => {
        if (cacheProbeTokenRef.current !== currentProbeToken) {
          return;
        }

        reportUploadRenderLoop(
          'E',
          'WordTemplateWorkflowPanel:upload-cache-effect-error',
          'upload cache detect failed',
          {
            revision: options.sampleUploadState.revision,
          }
        );
        options.setDetectedUploadCacheStatus('none');
        options.setDetectedUploadCacheUpdatedAt(null);
        options.setDetectedUploadCacheResult(null);
      });
  }, [
    options.hostAdapter,
    options.sampleUploadState,
    options.setDetectedUploadCacheResult,
    options.setDetectedUploadCacheStatus,
    options.setDetectedUploadCacheUpdatedAt,
    options.workflowSourceLanguage,
    options.workflowTargetLanguages,
  ]);
}
