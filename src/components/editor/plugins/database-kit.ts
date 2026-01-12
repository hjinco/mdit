import { createPlatePlugin } from 'platejs/react'
import { DatabaseElement } from '../ui/node-database'

export const DATABASE_KEY = 'database'

export const databasePlugin = createPlatePlugin({
  key: DATABASE_KEY,
  node: {
    component: DatabaseElement,
    isElement: true,
    isVoid: true,
  },
})

export const DatabaseKit = [databasePlugin]
