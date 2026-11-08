// Presentation-only state. Switching views never rebuilds the training form.
function setTrainingView(view) {
    document.getElementById('training-page').dataset.view = view;
    document.querySelectorAll('.training-tabs [role="tab"]').forEach(tab => {
        const selected = tab.id === `${view}-tab`;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
}

document.querySelector('.training-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = document.getElementById('training-page').dataset.view;
    const view = event.key === 'Home' ? 'current' : event.key === 'End' ? 'history' : current === 'current' ? 'history' : 'current';
    setTrainingView(view);
    document.getElementById(`${view}-tab`).focus();
});

// Both panels are visible on desktop, so remove mobile-only tab semantics there.
const trainingMobileQuery = window.matchMedia('(max-width: 1023px)');
function updateTrainingPanelSemantics() {
    for (const view of ['current', 'history']) {
        const panel = document.getElementById(`${view}-panel`);
        panel.setAttribute('role', trainingMobileQuery.matches ? 'tabpanel' : 'region');
        if (trainingMobileQuery.matches) panel.setAttribute('aria-labelledby', `${view}-tab`);
        else {
            panel.removeAttribute('aria-labelledby');
            panel.setAttribute('aria-label', view === 'current' ? '本次训练' : '历史记录');
        }
    }
}
trainingMobileQuery.addEventListener('change', updateTrainingPanelSemantics);
updateTrainingPanelSemantics();

if (window.visualViewport) {
    const updateViewport = () => {
        const viewport = window.visualViewport;
        const editing = document.activeElement?.matches('input, textarea');
        const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        const keyboardOpen = editing && inset > 100 && viewport.scale === 1;
        document.body.classList.toggle('keyboard-open', Boolean(keyboardOpen));
        document.documentElement.style.setProperty('--keyboard-inset', keyboardOpen ? `${inset}px` : '0px');
        document.documentElement.style.setProperty('--visual-height', `${viewport.height}px`);
    };
    window.visualViewport.addEventListener('resize', updateViewport);
    window.visualViewport.addEventListener('scroll', updateViewport);
    document.addEventListener('focusin', updateViewport);
    document.addEventListener('focusout', () => requestAnimationFrame(updateViewport));
    updateViewport();
}
