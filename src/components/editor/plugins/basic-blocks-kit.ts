import {
  BlockquotePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  HorizontalRulePlugin,
} from '@platejs/basic-nodes/react'
import { ParagraphPlugin } from 'platejs/react'

import { BlockquoteElement } from '../ui/node-blockquote'
import {
  H1Element,
  H2Element,
  H3Element,
  H4Element,
  H5Element,
  H6Element,
} from '../ui/node-heading'
import { HrElement } from '../ui/node-hr'
import { ParagraphElement } from '../ui/node-paragraph'
import { withDiffStyle } from './diff-kit'

export const BasicBlocksKit = [
  ParagraphPlugin.withComponent(withDiffStyle(ParagraphElement)),
  H1Plugin.configure({
    node: {
      component: withDiffStyle(H1Element),
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+1' } },
  }),
  H2Plugin.configure({
    node: {
      component: withDiffStyle(H2Element),
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+2' } },
  }),
  H3Plugin.configure({
    node: {
      component: withDiffStyle(H3Element),
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+3' } },
  }),
  H4Plugin.configure({
    node: {
      component: withDiffStyle(H4Element),
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+4' } },
  }),
  H5Plugin.configure({
    node: {
      component: withDiffStyle(H5Element),
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+5' } },
  }),
  H6Plugin.configure({
    node: {
      component: withDiffStyle(H6Element),
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+6' } },
  }),
  BlockquotePlugin.configure({
    node: { component: withDiffStyle(BlockquoteElement) },
    shortcuts: { toggle: { keys: 'mod+shift+period' } },
  }),
  HorizontalRulePlugin.withComponent(withDiffStyle(HrElement)),
]
