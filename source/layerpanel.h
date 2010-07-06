#ifndef LAYERPANEL_H
#define LAYERPANEL_H

#include <qapplication.h>
#include <qheader.h>
#include <qdockwindow.h>
#include <qptrlist.h>
#include <qtoolbox.h>
#include <qlistview.h>
#include <qmessagebox.h>

class LayerPanel: public QDockWindow {
    Q_OBJECT
public:
    LayerPanel( Place p = InDock, QWidget * parent = 0, const char * name = 0, WFlags f = 0 );
    virtual ~LayerPanel();

protected:
    //void closeEvent( QCloseEvent * );

signals:
    void visibilityChanged( int, bool );

public slots:
	void addItem( QString& layerName, int layerIndex );
	void addItem( QString& layerName, int layerIndex, bool visible );
	void addItemAfter( int place, QString& name );
	void removeItem( int layerIndex );
	void processClick( QListViewItem* item );
	void removeAllItems();

private:
	QListView *lv;
};

#endif
