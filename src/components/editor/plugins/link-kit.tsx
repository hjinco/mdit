import { LinkPlugin } from '@platejs/link/react'
import { LinkFloatingToolbar } from '../ui/link-toolbar'
import { LinkElement } from '../ui/node-link'
import { withDiffStyle } from './diff-kit'

export const LinkKit = [
  LinkPlugin.configure({
    render: {
      node: withDiffStyle(LinkElement),
      afterEditable: () => <LinkFloatingToolbar />,
    },
    options: {
      isUrl() {
        return true
      },
    },
  }),
]
