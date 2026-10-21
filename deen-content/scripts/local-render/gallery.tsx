// Component gallery: sample configs for scene types not used in the current
// reel, so every template can be visually checked before it is needed.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {BrandBackground} from '../../src/components/BrandBackground';
import {BrandSignature} from '../../src/components/BrandSignature';
import type {ChecklistScene, DiagramScene, TerminalScene} from '../../src/content/schema';
import {ChecklistScene as Checklist} from '../../src/scenes/ChecklistScene';
import {DiagramScene as Diagram} from '../../src/scenes/DiagramScene';
import {TerminalScene as Terminal} from '../../src/scenes/TerminalScene';

const base = {durationInFrames: 300, purpose: 'gallery', onScreen: '', storyboard: {visual: '', animation: ''}};

const checklist: ChecklistScene = {
  ...base,
  id: 'g-checklist',
  type: 'checklist',
  kicker: 'BEFORE YOU USE AN AGENT',
  headline: [{text: 'Four questions'}, {text: 'to answer first.', highlight: true}],
  items: ['Are the steps known in advance?', 'Can a wrong action be undone?', 'Who approves risky steps?', 'How will you measure success?'],
  itemStart: 20,
  itemStagger: 18,
  rule: 'Steps known + irreversible actions? Start with a workflow.',
};

const diagram: DiagramScene = {
  ...base,
  id: 'g-diagram',
  type: 'diagram',
  kicker: 'RAG IN 30 SECONDS',
  headline: [{text: 'Where answers'}, {text: 'actually come from.'}],
  nodes: [
    {label: 'User question', detail: 'query'},
    {label: 'Retriever', detail: 'top-k chunks', tone: 'warning'},
    {label: 'Prompt + context', detail: 'grounding'},
    {label: 'LLM answer', detail: 'with citations', tone: 'success'},
  ],
  nodeStart: 20,
  nodeStagger: 16,
  callout: {nodeIndex: 1, text: 'If retrieval misses, the model can’t cite what it never saw.', at: 110},
};

const terminal: TerminalScene = {
  ...base,
  id: 'g-terminal',
  type: 'terminal',
  kicker: 'BUILD WITH ME',
  headline: [{text: 'Run the eval'}, {text: 'on every change.'}],
  title: 'eval-run',
  lines: [
    {text: '$ run-evals --set refunds', at: 10},
    {text: 'cases ........ 50', at: 50, tone: 'neutral'},
    {text: 'passed ....... 31', at: 70, tone: 'success'},
    {text: 'failed ....... 19', at: 90, tone: 'warning'},
    {text: '(illustrative output)', at: 110, tone: 'neutral'},
  ],
  charsPerFrame: 1.2,
};

export const GalleryStill: React.FC<{which: string}> = ({which}) => (
  <AbsoluteFill>
    <BrandBackground />
    {which === 'diagram' ? <Diagram scene={diagram} /> : which === 'terminal' ? <Terminal scene={terminal} /> : <Checklist scene={checklist} />}
    <BrandSignature />
  </AbsoluteFill>
);
