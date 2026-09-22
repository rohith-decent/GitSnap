import { mount } from 'svelte';
import CommitEditor from './CommitEditor.svelte';

const app = mount(CommitEditor, {
  target: document.getElementById('app')!,
});

export default app;
