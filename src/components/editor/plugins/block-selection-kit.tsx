import { BlockMenuPlugin, BlockSelectionPlugin } from '@platejs/selection/react'
import { getPluginTypes, KEYS } from 'platejs'
import type { PlateElementProps } from 'platejs/react'
import { BlockContextMenu } from '../ui/block-context-menu'
import { BlockSelection } from '../ui/block-selection'

export const BlockSelectionKit = [
  BlockSelectionPlugin.configure(({ editor }) => ({
    options: {
      enableContextMenu: true,
      isSelectable: (element) => {
        return !getPluginTypes(editor, [KEYS.codeLine, KEYS.td]).includes(
          element.type
        )
      },
    },
    render: {
      belowRootNodes: (props) => {
        if (!props.attributes.className?.includes('slate-selectable'))
          return null

        return <BlockSelection {...(props as unknown as PlateElementProps)} />
      },
    },
  })),
  BlockMenuPlugin.configure({
    render: { aboveEditable: BlockContextMenu },
  }),
]
