//parse function from https://stackoverflow.com/questions/4200913/xml-to-javascript-object
function parseXml(xml, arrayTags) {
    let dom = null;
    if (window.DOMParser) dom = (new DOMParser()).parseFromString(xml, "text/xml");
    else if (window.ActiveXObject) {
        dom = new ActiveXObject('Microsoft.XMLDOM');
        dom.async = false;
        if (!dom.loadXML(xml)) throw dom.parseError.reason + " " + dom.parseError.srcText;
    }
    else throw new Error("cannot parse xml string!");

    function parseNode(xmlNode, result) {
        if (xmlNode.nodeName == "#text") {
            let v = xmlNode.nodeValue;
            if (v.trim()) result['#text'] = v;
            return;
        }

        let jsonNode = {},
            existing = result[xmlNode.nodeName];
        if (existing) {
            if (!Array.isArray(existing)) result[xmlNode.nodeName] = [existing, jsonNode];
            else result[xmlNode.nodeName].push(jsonNode);
        }
        else {
            if (arrayTags && arrayTags.indexOf(xmlNode.nodeName) != -1) result[xmlNode.nodeName] = [jsonNode];
            else result[xmlNode.nodeName] = jsonNode;
        }

        if (xmlNode.attributes) for (let attribute of xmlNode.attributes) jsonNode[attribute.nodeName] = attribute.nodeValue;

        for (let node of xmlNode.childNodes) parseNode(node, jsonNode);
    }

    let result = {};
    for (let node of dom.childNodes) parseNode(node, result);

    return result;
}

export async function postJSON(url ,data) {
    try {
	const response = await fetch(url, {
	    method: "POST",
	    headers: {
		"Content-Type": "application/json",
	    },
	    body: JSON.stringify(data),
	});
	
	const result = await response.json();
	//console.log("Success:", result);
	return result;
    } catch (error) {
	//console.error("Error:", error);
	return Promise.reject("Error:", error);
    }
}

//erik's 84/5849
export async function fetchdblp(dblpid) {
    const loading = async() => {
	const response = await fetch("https://dblp.org/pid/"+dblpid+".xml");
	if (response.status != 200)
	    throw "no response";
	const xml = await response.text();
	return xml;
    }
    return loading()
	.catch(error => {
	    let deb = document.getElementById("debuginfo");
	    let r = document.createElement("p")
	    r.textContent="could not fetch dblp for "+dblpid;
	    deb.appendChild(r);
	    return Promise.reject(error);
	})
	.then(text =>{
	return parseXml(text);
    });
}

//returns a dictionary of objects where the key are dblpkey and the values are objects representing the papers
export async function papersof(dblpid) {
    return fetchdblp(dblpid)
    .then(i=> {
	const papers = i["dblpperson"]["r"];
	let dict = {}
	//console.log(papers);
	papers.forEach(pobj => {
	    let thepaper = undefined;
	    if (pobj.inproceedings != undefined) {
		thepaper = pobj.inproceedings;
		thepaper.dblptype = "inproceedings";
	    }
	    if (pobj.article != undefined) {
		thepaper = pobj.article;
		thepaper.dblptype = "article";
	    }
	    if (thepaper != undefined)
		dict[thepaper.key] = thepaper;
	});
	return dict;
    });
}

//take dictionary like the one returned by papersof and return a array
//sorted by date (recent first)
export function dblpdicttosortedarray(papers) {
    let pp = [];
    for (let key in papers) {
	pp.push(papers[key]);
    }

    //console.log(pp);

    pp.sort((a,b) => {
	//sort per year
	let a_year = parseInt(a.year["#text"]);
	let b_year = parseInt(b.year["#text"]);
	if (b_year - a_year != 0)
	    return b_year - a_year;
	//then per mdate. modifed date isn't great, but it has a chance of being a bit right and we have nothing else to go by anyway
	return ('' + b.mdate).localeCompare(a.mdate);
    });

    return pp;
}

//renders the papers in paperarray by appending into domelement
export function renderpapers(domelement, paperarray, author_highlight) {
    //console.log(paperarray);
    paperarray.forEach(this_paper => {
	try {
	    //arxiv papers are marked informal for instance, skip them
	    if (this_paper.publtype != 'informal') {
		domelement.appendChild(HTMLofPaper(this_paper, author_highlight));
	    }
	} catch(error) {
	    //if for anyreason, we can't render a paper, just skip it!
	}
    });
}

//returns a dom element representing the authors in authorarray
export function HTMLofAuthors(authorarray, author_highlight) {
    let authorspan = document.createElement("span");
    authorspan.setAttribute("class", "authors");
    //console.log(authorarray);
    authorarray.forEach((this_author, indauthor) => {
	let this_author_span = document.createElement("span");
	let authorname = this_author["#text"]
	    .replace(/ \d+$/, ''); //strip numbers at the end of names (from dblp disambiguation)
	this_author_span.textContent = authorname;

	//handle highlight
	if (this_author.pid in author_highlight) {
	    this_author_span.classList.add(author_highlight[this_author.pid]);
	}

	authorspan.appendChild(this_author_span);

	//handle prep authorspan for next entry
	if (indauthor != authorarray.length-1) {
	    const comma = document.createTextNode(", ");
	    authorspan.appendChild(comma);
	}
    });

    return authorspan;    
}

//returns a dom element representing the paper represented by dblppaper
export function HTMLofPaper(dblppaper, author_highlight) {
    const para = document.createElement("p");

    //authors
    const authorspan = HTMLofAuthors(dblppaper.author, author_highlight);
    
    //title
    const titlespan = document.createElement("span");
    titlespan.setAttribute("class", "title");
    titlespan.textContent = dblppaper.title["#text"];
    
    const by = document.createTextNode(" By ");
    const intext = document.createTextNode(" in ");
    const space = document.createTextNode(" ");

    //year
    const year = document.createElement("span");
    year.setAttribute("class", "year");
    year.textContent = dblppaper.year["#text"];

    //venue
    const where = document.createElement("span");
    where.setAttribute("class", "where");
    if (dblppaper.dblptype == "inproceedings")
	where.textContent = dblppaper.booktitle["#text"];
    else if (dblppaper.dblptype == "article")
	where.textContent = dblppaper.journal["#text"];


    para.appendChild(titlespan);
    para.appendChild(by);
    para.appendChild(authorspan);    
    para.appendChild(intext);
    para.appendChild(where);
    para.appendChild(space);

    para.appendChild(year);

    
    return para;
    
}

export function papertostring(dblppaper) {
    return ""+dblppaper.title["#text"] +" in ";
}

export function printpaper(dblppaper) {
    console.log(papertostring(dblppaper));
}
