#ifndef CONVERT_H
#define CONVERT_H

#include "point.h"
#include <qpainter.h>
#include <qcolor.h>
#include <qmessagebox.h>

class Convert {
protected:
	static int screenx;
	static int screeny;
	static int xmax;
	static int xmin;
	static int ymax;
	static int ymin;
	static int dx;
	static int dy;
	static double centerx;
	static double centery;
	static double diffx;
	static double diffy;

	Convert();

public:
	static void	init( int width=1024, int height=768 );
	static void reinit( int width, int height );
	static void setCenter( double x, double y );
	static int degreeToPixelX( double degree, double sf );
	static int degreeToPixelY( double degree, double sf );
	static double pixelToDegreeX( int pixel, double sf );	// Longitude
	static double pixelToDegreeY( int pixel, double sf );	// Latitude
};

#endif
