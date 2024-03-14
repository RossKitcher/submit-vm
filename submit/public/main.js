
async function dropdownClick() {

    try {
        renderTypes(await getTypes());
    } catch (err) {
        console.log(`Error: ${err}`);
    }

    document.getElementById("dropdownItems").classList.toggle("show");
}

window.onclick = function(event) {
    if (!event.target.matches('.drop-button')) {
        var dropdowns = document.getElementsByClassName("drop-content");
        var i;
        for (i = 0; i < dropdowns.length; i++) {
            var openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
            while (openDropdown.firstChild) {
                openDropdown.removeChild(openDropdown.lastChild);
            }
        }        
    }
}

async function getTypes() {
    let APIEndPoint = "https://distsystem.uksouth.cloudapp.azure.com/sub/types";
    
    try {
        const payload = await fetch(APIEndPoint);
        if (!payload.ok) {
            return [];
        } else {
            const res = await payload.json();
            return res;
        }
    } catch (err) {
        console.log(`Error: ${err}`);
    }
}

function onDropdownItemClick(event) {
    const dropdownButton = document.getElementById("dropdownButton")
    dropdownButton.innerHTML = event.innerHTML;
}

function renderTypes(types) {
    // Get dropdown parent
    const dropdownDiv = document.getElementById("dropdownItems");
    
    for (let i = 0; i < types.length; i++) {
        let newElement = document.createElement("a");
        let text = document.createTextNode(types[i].type);
        newElement.setAttribute("onclick", "onDropdownItemClick(this)");
        newElement.appendChild(text);
        dropdownDiv.appendChild(newElement);
    }
}

async function submitClick() {
    const setup = document.getElementById("setup");
    const punchline = document.getElementById("punchline");
    const type = document.getElementById("dropdownButton");

    const data = {
        "type": type.innerHTML,
        "setup": setup.value,
        "punchline": punchline.value
    };

    console.log(data);

    try {
        await fetch ("https://distsystem.uksouth.cloudapp.azure.com/sub/sub", {
            method: "POST",
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        })
    } catch (err) {
        console.log(`Failed: ${err}`);
    }
}
