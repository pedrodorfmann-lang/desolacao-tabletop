import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/barlow-condensed/400.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '../theme.css'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { useGmStore } from './store'

void useGmStore.getState().init()

// Grava o progresso de forma síncrona ao fechar, evitando perder cache/cena
// gerados nos últimos instantes (o salvamento normal é debounced).
window.addEventListener('beforeunload', () => {
  const st = useGmStore.getState()
  if (!st.ready) return
  try {
    window.api.flush(
      { assets: Object.values(st.library) },
      {
        scenes: st.scenes.map((sc) =>
          sc.id === st.currentSceneId ? { ...sc, state: st.scene } : sc
        ),
        currentSceneId: st.currentSceneId
      }
    )
  } catch {
    /* processo pode já estar encerrando */
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
