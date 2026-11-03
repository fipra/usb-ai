(() => {
  const player = document.getElementById('ibm-video-player');
  const title = document.getElementById('daily-video-title');
  const description = document.querySelector('.video-card-body p');
  const choices = document.querySelectorAll('.video-choice');
  choices.forEach(choice => choice.addEventListener('click', () => {
    choices.forEach(item => item.removeAttribute('aria-current'));
    choice.setAttribute('aria-current', 'true');
    const videoTitle = choice.querySelector('span').textContent;
    player.title = `IBM Technology – ${videoTitle}`;
    title.textContent = videoTitle;
    description.hidden = true;
  }));
})();
