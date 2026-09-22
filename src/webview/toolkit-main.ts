import { mount } from 'svelte';
import Toolkit from './Toolkit.svelte';

const target = document.getElementById('app');
if (target) {
  mount(Toolkit, { target });
}
