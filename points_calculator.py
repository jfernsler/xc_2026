def race_points(place, category="varsity"):
    """
    Given a placement (1-based) and category, return the points awarded.
    
    Args:
        place: Finishing position (1 = first place)
        category: One of "varsity", "jv2", "jv1", "freshman"
    
    Starting points:
        varsity  = 575
        jv2      = 540
        jv1      = 500
        freshman = 500
        ms       = 500
    
    Decrement pattern:
      -10 x1, -9 x2, -8 x3, -7 x4, -6 x5, -5 x6, -4 x7, -3 x8, -2 x9, -1 x10
    """
    start_points = {
        "varsity": 575,
        "jv2": 540,
        "jv1": 500,
        "freshman": 500,
        "ms": 500,
    }

    category = category.lower()
    if category not in start_points:
        raise ValueError(f"Unknown category '{category}'. Must be one of: {list(start_points.keys())}")
    if place < 1:
        raise ValueError("Place must be >= 1")

    points = start_points[category]
    decrement = 10
    count = 1
    max_count = 1

    for p in range(2, place + 1):
        points -= decrement
        count += 1
        if count > max_count:
            decrement -= 1
            if decrement < 1:
                decrement = 1
            max_count += 1
            count = 1

    return points