(function ($) {

    "use strict";

    $.expr[":"].rightmost = function (el) {
        var elem = $(el),
            pos = elem.offset().left,
            nextPos = elem.next().length ? elem.next().offset().left : 0;
        return nextPos !== 0 ? nextPos <= pos : false;
    };

/*---------------------------------------------------------------------------
Config
---------------------------------------------------------------------------*/

    var queue,
        added = false,
        defaults = [
            "Steven Spielberg",
            "Brian De Palma",
            "Martin Scorsese",
            "George Lucas",
            "Francis Ford Coppola"
        ],
        directors = $("#directors"),
        settings = $("#settings"),
        movies = $("#movies"),
        input = $("#add_input"),
        addbtn = $("#add_btn"),
        app = $("body"),
        main = $("#main"),
        menu = $("#menu"),
        movieLists = function () { return $(".movieList"); },
        movieItems = function () { return $(".movieItem"); },
        error = function () { return $("#error"); },
        loading = function () { return $("#loading"); },
        templates = {
            director: $("#director_tpl").html(),
            error: $("#error_tpl").html(),
            loading: $("#loading_tpl").html(),
            movie: $("#movie_tpl").html(),
            movieList: $("#movie_list_tpl").html(),
            watchLink: $("#watch_link_tpl").html()
        };

/*---------------------------------------------------------------------------
Persistence
---------------------------------------------------------------------------*/

    function save(directors) {
        window.localStorage.setItem("directors", JSON.stringify(directors));
    }

    function get(dID) {
        var directors = JSON.parse(window.localStorage.getItem("directors")) || {};
        return dID === undefined ? directors : directors[dID];
    }

    function store(dID, name) {
        var directors = get();
        directors[dID] = name;
        save(directors);
    }

    function unstore(dID) {
        var directors = get();
        delete directors[dID];
        save(directors);
    }

    function readAll() {
        return $.map(get(), function (d) {
            return d;
        });
    }

/*---------------------------------------------------------------------------
Interface
---------------------------------------------------------------------------*/

    function render(template, data) {
        $.each(data, function (prop) {
            template = template.replace(new RegExp("{{" + prop + "}}", "g"), data[prop]);
        });
        return template;
    }

    function scroll(hsh) {
        $("body,html").animate({scrollTop: $(hsh).offset().top}, 200, function () {
            window.location.hash = hsh;
        });
    }

    function changeMode() {
        main.toggleClass("inactive");
        settings.toggleClass("active");
    }

/*---------------------------------------------------------------------------
Data/Application
---------------------------------------------------------------------------*/

    function Request(name, partial) {
        var filter = partial ? "substringof('" + name + "', Name)" : "Name eq '" + name + "'";
        this.uri = "http://odata.netflix.com/Catalog/People?$filter=" + filter + "&$select=Id,Name,TitlesDirected&$expand=TitlesDirected&$format=json&$callback=?";
    }

    function Director(obj) {
        return {
            id: obj.Id,
            name: obj.Name,
            movies: []
        };
    }

    function Movie(obj) {
        return {
            bluray: obj.BluRay.Available,
            id: obj.Id,
            img: obj.BoxArt.HighDefinitionUrl || obj.BoxArt.LargeUrl,
            number: obj.Url.split("/").pop(),
            plot: obj.ShortSynopsis || obj.Synopsis.substr(0, 200) + "...",
            rating: obj.Rating,
            title: obj.ShortName,
            url: obj.TinyUrl,
            watch: obj.Instant.Available,
            year: obj.ReleaseYear
        };
    }

    function findByData(collection, key, value) {
        return collection.filter(function () {
            return $(this).data(key) === value;
        });
    }

    function load(name) {
        return $.getJSON(new Request(name).uri);
    }

    function remove(id) {

        // remove the director name from storage
        unstore(id);

        // remove the associated director settings item
        var d = findByData(directors.children(), "id", id).removeClass("complete");
        window.setTimeout(function () { d.remove(); }, 200);

        // remove the associated director movie list
        findByData($(".movieList"), "id", id).remove();
    }

    function toggle(id) {

        // uncheck the associated director settings item
        findByData(directors.children(), "id", id).toggleClass("unchecked");

        // uncheck the associated movie list
        findByData($(".movieList"), "id", id).toggleClass("unchecked");
    }

    function parse(resp) {

        // return if person hasn't directed anything   
        if (!resp.d.results.length) {
            return false;
        }

        var obj = resp.d.results[0],
            director = new Director(obj),
            titles = obj.TitlesDirected.results;

        // iterate over titles and create movies objects for each
        $.each(titles, function () {
            director.movies.push(new Movie(this));
        });

        // sort titles by year
        director.movies.sort(function (a, b) {
            return (a.year === b.year) ? 0 : (a.year > b.year) ? -1 : 1;
        });

        return director;
    }

    function fetch() {

        var query = queue.shift();

        // add loading indicator
        input.parent().append(templates.loading);

        $.when(load(query)).then(function (resp) {

            var director = parse(resp);

            // remove loading indicator
            loading().remove();

            // don't do anything but display an error if it's not a director
            if (!director) {
                input.parent().append(render(templates.error, {name: query.substr(0, 30)}));
                error().slideDown(200).delay(3000).slideUp(100, function () {
                    $(this).remove();
                });
                return;
            }

            // don't do anything if the director is already stored
            if (added && get(director.id)) {
                scroll("#director_" + director.id);
                return;
            }

            // store the director data
            store(director.id, director.name);

            // add a new item to the director settings list
            directors.append(render(templates.director, director));

            // add class for "build sequence"
            setTimeout(function () {
                directors.children().last().addClass("complete");
            }, 50);

            // add a new empty movieList to the main area
            movies.append(render(templates.movieList, director));

            // populate the new movie list
            $.each(director.movies, function () {

                // don't do anything if the current title is bonus material
                if (this.title.search("Bonus Material") === -1) {

                    // append a movieItem
                    movieLists().last().children("ol").append(render(templates.movie, this));

                    // if applicable, add a "watch" link to the movieItem
                    if (this.watch) {
                        $("menu", movieItems().last()).prepend(render(templates.watchLink, this));
                    }
                }
            });

            // if the director was added by the user (vs. during init)
            if (added) {
                added = false;
                scroll("#director_" + director.id);
            }

            if (queue.length) {
                fetch();
            } else {
                app.trigger("complete");
            }
        });
    }

/*---------------------------------------------------------------------------
Initialization
---------------------------------------------------------------------------*/

    // remove a director
    app.bind("remove", function (e) {
        remove(e.id);
    });

    // check or uncheck a specific director
    app.bind("toggle", function (e) {
        toggle(e.id);
    });

    // switch between the settings and main area
    app.bind("changeMode", function () {
        changeMode();
    });

    // focus on a specific movie list
    app.bind("show", function (e) {
        scroll(e.hash);
    });

    // once the fetching sequence is complete
    app.bind("complete", function () {
        loading().remove();
        movies.show();
        $(window).triggerHandler("resize");
    });

    // when a director settings item is toggled
    directors.delegate("input", "change", function (e) {
        app.trigger({type: "toggle", id: $(e.target).data("id")});
    });

    // when a director is deleted (from settings or movie list)
    app.delegate(".delete", "click", function (e) {
        e.preventDefault();
        app.trigger({type: "remove", id: $(e.target).data("id")});
    });

    // when a movie item is clicked
    movies.delegate("[href^=#movie]", "click focus", function (e) {
        e.preventDefault();
        var target = e.currentTarget.hash;
        movieItems().not(target).removeClass("target");
        $(target).toggleClass("target");
    });

    // when a movie item is clicked
    movies.delegate("[href^=#movie]", "blur", function (e) {
        var target = e.currentTarget.hash;
        $(target).removeClass("target");
    });

    // when a director settings item is clicked
    directors.delegate("[href^=#director]", "click", function (e) {
        e.preventDefault();
        changeMode();
        app.trigger({type: "show", hash: e.target.hash});
    });

    // when the enter key is pressed from the input field
    input.keypress(function (event) {

        // clean up input
        var name = $.trim(input.val());

        // stop if the key pressed wasn't enter
        if (event.keyCode !== 13) {
            return;
        }

        // add name to the queue
        queue.push(name);

        // fetch the requested director
        added = true; fetch();

        // clear input field value
        input.val("");
    });

    $(window).bind("hashchange", function () {
        if (window.location.hash === "#settings") {
            menu.addClass("alt");
        } else {
            menu.removeClass("alt");
        }
    });

    // when the "add director" button is clicked
    addbtn.click(function () {
        input.toggleClass("focused").focus();
    });

    // when the new director input looses focus    
    input.blur(function () {
        input.toggleClass("focused");
    });

    // when the window is resized, mark movieItems that are at end of rows
    $(window).resize(function () {
        $(".edge").removeClass("edge");
        $(".movieItem:rightmost").addClass("edge");
    });

    // setup the queue from either localStorage or static defaults
    queue = readAll().length ? readAll() : defaults;

    // initial load
    movies.hide().before(templates.loading);
    fetch();

}(window.jQuery));