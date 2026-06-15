let step = 0;

const steps = document.querySelectorAll(".step");
const bar = document.getElementById("bar");

function render() {
 steps.forEach((s, i) => {
   s.classList.toggle("active", i === step);
 });

 bar.style.width = ((step + 1) / steps.length) * 100 + "%";
}

function next() {
 if (step < steps.length - 1) {
   step++;
   render();
 }
}

function submit() {
 document.getElementById("success").classList.remove("hidden");
}

render();
