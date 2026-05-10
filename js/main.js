function toggleMenu() {
    const navLinks = document.getElementById('navLinks');
    const btn = document.querySelector('.menu-toggle');
    if (!navLinks || !btn) {
        return;
    }

    const isOpen = navLinks.classList.toggle('active');
    btn.setAttribute('aria-expanded', isOpen);
}

document.addEventListener('DOMContentLoaded', function () {
    const menuButton = document.querySelector('.menu-toggle');
    const navLinks = document.getElementById('navLinks');

    if (menuButton && navLinks) {
        menuButton.addEventListener('click', toggleMenu);
    }

    document.querySelectorAll('.nav-links a').forEach(function (link) {
        link.addEventListener('click', function () {
            if (navLinks) {
                navLinks.classList.remove('active');
            }
            if (menuButton) {
                menuButton.setAttribute('aria-expanded', 'false');
            }
        });
    });
});
