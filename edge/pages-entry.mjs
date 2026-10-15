// Workerd's entrypoint exports only its fetch handler. Test helpers stay inside
// the bundle rather than being exposed as unsupported named entrypoints.
export {default} from './pages-worker.mjs';
