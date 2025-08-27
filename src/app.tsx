import './globals.css'
import { Editor } from './components/editor/editor'
import { Tabbar } from './components/tabbar/tabbar'

export function App() {
  return (
    <div className="h-screen flex flex-col">
      <Tabbar />
      <div className="flex-1 overflow-auto">
        <Editor />
      </div>
    </div>
  )
}
