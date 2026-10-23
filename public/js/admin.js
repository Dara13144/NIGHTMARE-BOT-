// Nightmare Store Admin Client Utilities
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('[id$="Modal"]').forEach(el => {
      el.classList.add('hidden');
    });
  }
});
