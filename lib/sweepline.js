/*jslint node: true */
/*
 * Adapted from https://github.com/nathan-muir/sweepline, Copyright (C) 2012-2013 Simon Tokumine
 */
'use strict';

// Memoization of edges to process
var EventQueue = function (polygon) {

    var individualVertices = polygon.coordinates[0].length - 1;  // last vertex in geojson is equal to first vertex
    this.number_of_events = 2 * (individualVertices);        // 2 per edge - last event looping back to 0 is handled by +1 below
    this.events = [];

    // build up 2 'events' per edge. One for left vertex, one for right.
    for (var i = 0; i < individualVertices; i++) {
        var a = 2 * i;
        var b = 2 * i + 1;
        this.events[a] = {edge: i};
        this.events[b] = {edge: i};
        this.events[a].vertex = polygon.coordinates[0][i];
        this.events[b].vertex = polygon.coordinates[0][i + 1];
        if (comparePoints(this.events[a].vertex, this.events[b].vertex) < 0) {
            this.events[a].type = 'left';
            this.events[b].type = 'right';
        } else {
            this.events[a].type = 'right';
            this.events[b].type = 'left';
        }
    }

    // sort events lexicographically
    this.events.sort(function (a, b) {
        return comparePoints(a.vertex, b.vertex);
    });
};

exports.EventQueue = EventQueue;

// Determines the xy lexicographical order of two points
function comparePoints(point, otherPoint) {
    // x-coord first
    if (point[0] > otherPoint[0]) return  1;
    if (point[0] < otherPoint[0]) return -1;

    // y-coord second
    if (point[1] > otherPoint[1]) return  1;
    if (point[1] < otherPoint[1]) return -1;

    // they are the same point
    return 0;
};

// tests if point is Left|On|Right of the line P0 to P1.
//
// returns:
//  >0 for left of the line
//  0 for on the line
//  <0 for right of the line
function isPointLeft(point, p0, p1) {
    return (p1[0] - p0[0]) * (point[1] - p0[1]) - (point[0] - p0[0]) * (p1[1] - p0[1]);
};

// Tests polygon simplicity.
// returns true if simple, false if not.
function isSimplePolygon(polygon) {
    var e, s,
        eventQueue = new EventQueue(polygon),
        sweepLine = new SweepLine(polygon);

    // This loop processes all events in the sorted queue
    // Events are only left or right vertices
    while (e = eventQueue.events.shift()) {
        if (e.type == 'left') {
            s = sweepLine.add(e);

            if (sweepLine.intersect(s, s.above)) {
                return false;
            }
            if (sweepLine.intersect(s, s.below)) {
                return false;
            }

        } else {
            s = sweepLine.find(e);

            if (sweepLine.intersect(s.above, s.below)) {
                return false;
            }

            sweepLine.remove(s);
        }
    }
    return true;
};

exports.isSimplePolygon = isSimplePolygon;


/*****
 *
 *   RedBlackNode.js
 *
 *   copyright 2004, Kevin Lindsey
 *   licensing info available at: http://www.kevlindev.com/license.txt
 *
 *****/


/*****
 *
 *   constructor
 *
 *****/
var RedBlackNode = function (value) {
    this._left = null;
    this._right = null;
    this._value = value;
    this._height = 1;
    this.VERSION = 1.0;
};


/*****
 *
 *   add
 *
 *****/
RedBlackNode.prototype.add = function (value) {
    var relation = value.compare(this._value);
    var addResult;
    var result;
    var newNode;

    if (relation != 0) {
        if (relation < 0) {
            if (this._left != null) {
                addResult = this._left.add(value);
                this._left = addResult[0];
                newNode = addResult[1];
            } else {
                newNode = this._left = new RedBlackNode(value);
            }
        } else if (relation > 0) {
            if (this._right != null) {
                addResult = this._right.add(value);
                this._right = addResult[0];
                newNode = addResult[1];
            } else {
                newNode = this._right = new RedBlackNode(value);
            }
        }
        result = [this.balanceTree(), newNode];
    } else {
        result = [this, this];
    }

    return result;
};


/*****
 *
 *   balanceTree
 *
 *****/
RedBlackNode.prototype.balanceTree = function () {
    var leftHeight = (this._left != null) ? this._left._height : 0;
    var rightHeight = (this._right != null) ? this._right._height : 0;
    var result;

    if (leftHeight > rightHeight + 1) {
        result = this.swingRight();
    } else if (rightHeight > leftHeight + 1) {
        result = this.swingLeft();
    } else {
        this.setHeight();
        result = this;
    }

    return result;
};


/*****
 *
 *   join
 *
 *****/
RedBlackNode.prototype.join = function (that) {
    var result;

    if (that == null) {
        result = this;
    } else {
        var top;

        if (this._height > that._height) {
            top = this;
            top._right = that.join(top._right);
        } else {
            top = that;
            top._left = this.join(top._left);
        }

        result = top.balanceTree();
    }

    return result;
};


/*****
 *
 *   moveLeft
 *
 *****/
RedBlackNode.prototype.moveLeft = function () {
    var right = this._right;
    this._right = right._left;
    right._left = this;
    this.setHeight();
    right.setHeight();

    return right;
};


/*****
 *
 *   moveRight
 *
 *****/
RedBlackNode.prototype.moveRight = function () {
    var left = this._left;
    this._left = left._right;
    left._right = this;
    this.setHeight();
    left.setHeight();

    return left;
};


/*****
 *
 *   remove
 *
 *****/
RedBlackNode.prototype.remove = function (value) {
    var relation = value.compare(this._value);
    var remResult;
    var result;
    var remNode;

    if (relation != 0) {
        if (relation < 0) {
            if (this._left != null) {
                remResult = this._left.remove(value);
                this._left = remResult[0];
                remNode = remResult[1];
            } else {
                remNode = null;
            }
        } else {
            if (this._right != null) {
                remResult = this._right.remove(value);
                this._right = remResult[0];
                remNode = remResult[1];
            } else {
                remNode = null;
            }
        }

        result = this;
    } else {
        remNode = this;

        if (this._left == null) {
            result = this._right;
        } else if (this._right == null) {
            result = this._left;
        } else {
            result = this._left.join(this._right);
            this._left = null;
            this._right = null;
        }
    }

    if (remNode != null) {
        if (result != null) {
            return [result.balanceTree(), remNode];
        } else {
            return [result, remNode];
        }
    } else {
        return [this, null];
    }
};


/*****
 *
 *   setHeight
 *
 *****/
RedBlackNode.prototype.setHeight = function () {
    var leftHeight = (this._left != null) ? this._left._height : 0;
    var rightHeight = (this._right != null) ? this._right._height : 0;

    this._height = (leftHeight < rightHeight) ? rightHeight + 1 : leftHeight + 1;
};


/*****
 *
 *   swingLeft
 *
 *****/
RedBlackNode.prototype.swingLeft = function () {
    var right = this._right;
    var rightLeft = right._left;
    var rightRight = right._right;
    var left = this._left;

    var leftHeight = (left != null ) ? left._height : 0;
    var rightLeftHeight = (rightLeft != null ) ? rightLeft._height : 0;
    var rightRightHeight = (rightRight != null ) ? rightRight._height : 0;

    if (rightLeftHeight > rightRightHeight) {
        this._right = right.moveRight();
    }

    return this.moveLeft();
};


/*****
 *
 *   swingRight
 *
 *****/
RedBlackNode.prototype.swingRight = function () {
    var left = this._left;
    var leftRight = left._right;
    var leftLeft = left._left;
    var right = this._right;

    var rightHeight = (right != null ) ? right._height : 0;
    var leftRightHeight = (leftRight != null ) ? leftRight._height : 0;
    var leftLeftHeight = (leftLeft != null ) ? leftLeft._height : 0;

    if (leftRightHeight > leftLeftHeight) {
        this._left = left.moveLeft();
    }

    return this.moveRight();
};


/*****
 *
 *   traverse
 *
 *****/
RedBlackNode.prototype.traverse = function (func) {
    if (this._left != null) this._left.traverse(func);
    func(this);
    if (this._right != null) this._right.traverse(func);
};


/*****
 *
 *   toString
 *
 *****/
RedBlackNode.prototype.toString = function () {
    return this._value.toString();
};


exports.RedBlackNode = RedBlackNode;


/*****
 *
 * RedBlackTree.js (actually an AVL)
 *
 * copyright 2004, Kevin Lindsey
 * licensing info available at: http://www.kevlindev.com/license.txt
 *
 * uses duck typing for comparator to determine left and rightedness.
 * added objects must implement a method called .order. eg. a.order(b);
 *
 * .order should return:
 *
 * -1 a <   b
 *  0 a === b
 *  1 a >   b
 *
 *****/


/*****
 *
 *   constructor
 *
 *****/
var RedBlackTree = function () {
    this._root = null;
    this._cursor = null;
    this._ancestors = [];
    this.VERSION = 1.0;
};


/*****  private methods *****/

/*****
 *
 *   _findNode
 *
 *****/
RedBlackTree.prototype._findNode = function (value, saveAncestors) {
    if (saveAncestors == null) saveAncestors = false;

    var result = this._root;

    if (saveAncestors) {
        this._ancestors = [];
    }

    while (result != null) {

        var relation = value.compare(result._value);

        if (relation != 0) {
            if (saveAncestors) {
                this._ancestors.push(result);
            }
            if (relation < 0) {
                result = result._left;
            } else {
                result = result._right;
            }
        } else {
            break;
        }
    }

    return result;
};


/*****
 *
 *   _maxNode
 *
 *****/
RedBlackTree.prototype._maxNode = function (node, saveAncestors) {
    if (node == null) node = this._root;
    if (saveAncestors == null) saveAncestors = false;

    if (node != null) {
        while (node._right != null) {
            if (saveAncestors) {
                this._ancestors.push(node);
            }
            node = node._right;
        }
    }

    return node;
};


/*****
 *
 *   _minNode
 *
 *****/
RedBlackTree.prototype._minNode = function (node, saveAncestors) {
    if (node == null) node = this._root;
    if (saveAncestors == null) saveAncestors = false;

    if (node != null) {
        while (node._left != null) {
            if (saveAncestors) {
                this._ancestors.push(node);
            }
            node = node._left;
        }
    }

    return node;
};


/*****
 *
 *   _nextNode
 *
 *****/
RedBlackTree.prototype._nextNode = function (node) {
    var parent;
    if (node != null) {
        if (node._right != null) {
            this._ancestors.push(node);
            node = this._minNode(node._right, true);
        } else {
            var ancestors = this._ancestors;
            parent = ancestors.pop();

            while (parent != null && parent._right === node) {
                node = parent;
                parent = ancestors.pop();
            }

            node = parent;
        }
    } else {
        this._ancestors = [];
        node = this._minNode(this._root, true);
    }

    return node;
};


/*****
 *
 *   _previousNode
 *
 *****/
RedBlackTree.prototype._previousNode = function (node) {
    var parent;
    if (node != null) {
        if (node._left != null) {
            this._ancestors.push(node);
            node = this._maxNode(node._left, true);
        } else {
            var ancestors = this._ancestors;
            parent = ancestors.pop();

            while (parent != null && parent._left === node) {
                node = parent;
                parent = ancestors.pop();
            }

            node = parent;
        }
    } else {
        this._ancestors = [];
        node = this._maxNode(this._root, true);
    }

    return node;
};


/*****  public methods  *****/

/*****
 *
 *   add
 *
 *****/
RedBlackTree.prototype.add = function (value) {
    var result;

    if (this._root == null) {
        result = this._root = new RedBlackNode(value);
    } else {
        var addResult = this._root.add(value);

        this._root = addResult[0];
        result = addResult[1];
    }

    return result;
};


/*****
 *
 *   find
 *
 *****/
RedBlackTree.prototype.find = function (value) {
    var node = this._findNode(value);

    return ( node != null ) ? node._value : null;
};


/*****
 *
 *   findNext
 *
 *****/
RedBlackTree.prototype.findNext = function (value) {
    var current = this._findNode(value, true);

    current = this._nextNode(current);

    return (current != null ) ? current._value : null;
};


/*****
 *
 *   findPrevious
 *
 *****/
RedBlackTree.prototype.findPrevious = function (value) {
    var current = this._findNode(value, true);

    current = this._previousNode(current);

    return (current != null ) ? current._value : null;
};


/*****
 *
 *   max
 *
 *****/
RedBlackTree.prototype.max = function () {
    var result = this._maxNode();

    return ( result != null ) ? result._value : null;
};


/*****
 *
 *   min
 *
 *****/
RedBlackTree.prototype.min = function () {
    var result = this._minNode();

    return ( result != null ) ? result._value : null;
};


/*****
 *
 *   next
 *
 *****/
RedBlackTree.prototype.next = function () {
    this._cursor = this._nextNode(this._cursor);

    return ( this._cursor ) ? this._cursor._value : null;
};


/*****
 *
 *   previous
 *
 *****/
RedBlackTree.prototype.previous = function () {
    this._cursor = this._previousNode(this._cursor);

    return ( this._cursor ) ? this._cursor._value : null;
};


/*****
 *
 *   remove
 *
 *****/
RedBlackTree.prototype.remove = function (value) {
    var result;

    if (this._root != null) {
        var remResult = this._root.remove(value);

        this._root = remResult[0];
        result = remResult[1];
    } else {
        result = null;
    }

    return result;
};


/*****
 *
 *   traverse
 *
 *****/
RedBlackTree.prototype.traverse = function (func) {
    if (this._root != null) {
        this._root.traverse(func);
    }
};


/*****
 *
 *   toString
 *
 *****/
RedBlackTree.prototype.toString = function () {
    var lines = [];

    if (this._root != null) {
        var indentText = "  ";
        var stack = [
            [this._root, 0, "^"]
        ];

        while (stack.length > 0) {
            var current = stack.pop();
            var node = current[0];
            var indent = current[1];
            var line = "";

            for (var i = 0; i < indent; i++) {
                line += indentText;
            }

            line += current[2] + "(" + node.toString() + ")";
            lines.push(line);

            if (node._right != null) stack.push([node._right, indent + 1, "R"]);
            if (node._left != null) stack.push([node._left, indent + 1, "L"]);
        }
    }

    return lines.join("\n");
};


exports.RedBlackTree = RedBlackTree;


// S. Tokumine 18/04/2011
//
// Javascript port of http://softsurfer.com/Archive/algorithm_0108/algorithm_0108.htm
//
// The Intersections for a Set of 2D Segments, and Testing Simple Polygons
//
// Shamos-Hoey Algorithm implementation in Javascript
//


// A container class for segments (or edges) of the polygon to test
// Allows storage and retrieval from the Balanced Binary Tree
var SweepLineSeg = function (ev) {
    this.edge = ev.edge;
};

// required comparator for binary tree storage. Sort by y axis of the
// points where the segment crosses L (eg, the left point)
SweepLineSeg.prototype.compare = function (sls) {
    if (this.left_point[1] > sls.left_point[1]) return 1;
    if (this.left_point[1] < sls.left_point[1]) return -1;
    return 0;
};

SweepLineSeg.prototype.toString = function () {
    return "edge:" + this.edge;
};


// Main SweepLine class.
// For full details on the algorithm used, consult the C code here:
// http://softsurfer.com/Archive/algorithm_0108/algorithm_0108.htm
//
// This is a direct port of the above C to Javascript
var SweepLine = function (polygon) {
    this.tree = new RedBlackTree();
    this.polygon = polygon;
};

// Add Algorithm 'event' (more like unit of analysis) to queue
// Units are segments or distinct edges of the polygon.
SweepLine.prototype.add = function (ev) {

    // build up segment data
    var seg = new SweepLineSeg(ev);
    var p1 = this.polygon.coordinates[0][seg.edge];
    var p2 = this.polygon.coordinates[0][seg.edge + 1];

    // if it is being added, then it must be a LEFT edge event
    // but need to determine which endpoint is the left one first
    if (comparePoints(p1, p2) < 0) {
        seg.left_point = p1;
        seg.right_point = p2;
    } else {
        seg.right_point = p1;
        seg.left_point = p2;
    }

    // Add node to tree and setup linkages to "above" and "below"
    // edges as per algorithm
    var nd = this.tree.add(seg);

    var nx = this.tree.findNext(nd._value);
    var np = this.tree.findPrevious(nd._value);

    if (nx) {
        seg.above = nx;
        seg.above.below = seg;
    }
    if (np) {
        seg.below = np;
        seg.below.above = seg;
    }

    return seg;
};


SweepLine.prototype.find = function (ev) {

    // need a segment to find it in the tree
    // TODO: TIDY THIS UP!!!
    var seg = new SweepLineSeg(ev);
    var p1 = this.polygon.coordinates[0][seg.edge];
    var p2 = this.polygon.coordinates[0][seg.edge + 1];

    // if it is being added, then it must be a LEFT edge event
    // but need to determine which endpoint is the left one first
    if (comparePoints(p1, p2) < 0) {
        seg.left_point = p1;
        seg.right_point = p2;
    } else {
        seg.left_point = p2;
        seg.right_point = p1;
    }

    var nd = this.tree.find(seg);

    if (nd) {
        return nd;
    } else {
        return false;  // BUG: unsure what to return here. Probably not false.
    }
};

// When removing a node from the tree, ensure the above and below links are
// passed on to adjacent nodes before node is deleted
SweepLine.prototype.remove = function (seg) {

    // Pretty sure there is a bug here as the tree isn't getting pruned correctly.
    // In fact, I thin the remove method is removing the wrong elements from the list.
    //
    try {
        var nd = this.tree.find(seg);
    } catch (err) {
        return;
    }


    var nx = this.tree.findNext(nd);
    if (nx) {
        nx.below = seg.below;
    }

    var np = this.tree.findPrevious(nd);
    if (np) {
        np.above = seg.above;
    }

    this.tree.remove(seg);
};

// test intersect of 2 segments and return: false=none, true=intersect
SweepLine.prototype.intersect = function (s1, s2) {
    var e1, e2, lsign, rsign;
    if (!s1 || !s2) return false; // no intersect if either segment doesn't exist

    // check for consecutive edges in polygon
    e1 = s1.edge;
    e2 = s2.edge;

    if (((e1 + 1) % this.polygon.coordinates[0].length === e2) || (e1 === (e2 + 1) % this.polygon.coordinates[0].length))
        return false;      // no non-simple intersect since consecutive

    // test for existence of an intersect point
    lsign = isPointLeft(s2.left_point, s1.left_point, s1.right_point);     // s2 left point sign
    rsign = isPointLeft(s2.right_point, s1.left_point, s1.right_point);    // s2 right point sign
    if (lsign * rsign > 0) // s2 endpoints have same sign relative to s1
        return false;      // => on same side => no intersect is possible

    lsign = isPointLeft(s1.left_point, s2.left_point, s2.right_point);     // s1 left point sign
    rsign = isPointLeft(s1.right_point, s2.left_point, s2.right_point);    // s1 right point sign
    if (lsign * rsign > 0) // s1 endpoints have same sign relative to s2
        return false;      // => on same side => no intersect is possible

    return true;           // segments s1 and s2 straddle. Intersect exists.
};

exports.SweepLine = SweepLine;

