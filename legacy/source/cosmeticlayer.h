#ifndef COSMETICLAYER_H
#define COSMETICLAYER_H

#include "point.h"
#include "shape.h"
#include "shapetype.h"
#include "shapepoint.h"
#include "shapeclline.h"
#include "shapeclcircle.h"
#include "shapeclpolygon.h"
#include <qdir.h>
#include <qfile.h>
#include <qcolor.h>
#include <qptrlist.h>
#include <qobject.h>
#include <qdatastream.h>
#include <qpainter.h>
#include <qmessagebox.h>
#include <qdom.h>

class CosmeticLayer : public QObject {
Q_OBJECT
public:
    CosmeticLayer( QObject* parent );
    CosmeticLayer( QObject* parent, const QString& scl );
    virtual ~CosmeticLayer();

public slots:
	void draw( double scaleFactor, QPainter& painter );
	void addShape( Shape* shape );
	void removeShape( Shape* shape );
	void setName( const QString& fn );
	void setFillColor( const QColor& color );
	void setLineColor( const QColor& color );
	void save();
	int shapeCount();
	QString path();

private:
	QPtrList<Shape> *shapes;
	QString _name;
	QString _path;
	QColor _fillColor;
	QColor _lineColor;
};

#endif
