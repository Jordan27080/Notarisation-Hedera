/**
 * Point d'entrée unique pour pdfjs-dist.
 *
 * On configure GlobalWorkerOptions.workerSrc ici une seule fois,
 * via l'import Vite `?url`. Cela donne une URL correctement résolue
 * (node_modules en dev, asset bundlé en prod) que Chrome peut charger
 * comme worker ES-module sans déclencher le warning crbug/1173575.
 */
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjsLib }
