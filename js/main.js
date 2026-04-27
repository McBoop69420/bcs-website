function toggleMenu() {
    const navLinks = document.getElementById('navLinks');
    const btn = document.querySelector('.menu-toggle');
    const isOpen = navLinks.classList.toggle('active');
    btn.setAttribute('aria-expanded', isOpen);
}

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.nav-links a').forEach(function (link) {
        link.addEventListener('click', function () {
            document.getElementById('navLinks').classList.remove('active');
            document.querySelector('.menu-toggle').setAttribute('aria-expanded', 'false');
        });
    });
});
