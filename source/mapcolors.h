#ifndef MAPCOLORS_H
#define MAPCOLORS_H

#include <qcolor.h>
#include <qdatetime.h>
#include <stdlib.h>

class MapColors {
public:
	MapColors();
	QColor fillColor();
	QColor lineColor();

protected:
	int fillIndex;
	int lineIndex;
	int nFColors;
	int nLColors;
	QColor* fillColors;
	QColor* lineColors;
};

#endif
