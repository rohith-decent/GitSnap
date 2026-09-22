import { mount } from 'svelte';
import BranchDashboard from './BranchDashboard.svelte';

const target = document.getElementById('app');
if (target) {
  mount(BranchDashboard, { target });
}
