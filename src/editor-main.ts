import { mount } from 'svelte';
import './app.css';
import EditorApp from './editor/EditorApp.svelte';

const app = mount(EditorApp, { target: document.getElementById('app')! });

export default app;
