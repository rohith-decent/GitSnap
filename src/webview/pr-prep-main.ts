import { mount } from 'svelte';
import PrPrep from './PrPrep.svelte';

const target = document.getElementById('app');
if (target) {
  mount(PrPrep, { target });
}
